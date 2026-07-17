---
title: "The memory that runs the model"
date: 2026-07-18
draft: false
toc: true
---

If you'd asked me a year ago what limits how fast an LLM can answer, I'd have said the same thing you probably would, "the GPU." Turns out that's wrong. The GPU is often bored. What actually limits your LLM server is a piece of memory most people have never heard of. Once you see it, you can't unsee it. This is how I learned to see it. And how I built a tool so you can too.

When LLMs exploded in popularity, like everybody else I also started using them. First it was how to prompt for the answer I expected, how to write code that matched best practices, how to write better skills, how to do better context engineering. Then I started looking at how accurate and fast I could get those answers. And I found myself asking a simpler question: how exactly are these models hosted? Can any of the serving-layer optimizations help? That curiosity is what led me into the world of model serving and inference.

## A platform engineer's instinct

I've spent years shipping upstream Kubernetes features and running production workloads at Azure scale. When I thought about serving an LLM, it looked to me like any other workload. Or more accurately, "yet another class of workloads." I wanted to prove that to myself by building the smallest complete stack I could.

Even though, like everybody else, `model serving == GPU` was the equation I had in mind, I wanted to understand why. Could I just serve a model on a CPU? (I'd already proven to myself I could serve a model natively on Apple Silicon, but that's a story for another time.) That curiosity put me on a train of experiments. I looked into different model serving frameworks and decided to use vLLM. No apparent reason. I'd heard about it from friends and colleagues, and thought, why not start here.

I created a simple [`cpu-vllm`](https://github.com/nilekhc/inference-lab/tree/main/cpu-vllm) experiment on a KinD cluster serving `google/gemma-2-2b-it` from Hugging Face's model hub. The deployment is very simple:

- a secret holding `hf_token`
- a PVC to download the model weights into
- a deployment that uses both to start a vLLM server
- a service I can port-forward into to hit an OpenAI-compatible API

The whole deploy is three lines you'd recognize from any other Kubernetes workload:

```bash
envsubst '${HF_TOKEN}' < resources/secret.yaml | kubectl apply -f -
kubectl apply -f resources/pvc.yaml -f resources/service.yaml -f resources/deployment.yaml
kubectl rollout status deployment/vllm-server --timeout=10m
```

Once the server is up, port-forward and hit the OpenAI-compatible endpoint:

```bash
curl -s http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "google/gemma-2-2b-it",
    "messages": [
      {"role": "user", "content": "Explain Quantum Mechanics in one sentence."}
    ],
    "max_tokens": 100,
    "temperature": 0.7
  }'
```

Pretty boring, if you ask me. It works. It's slow, a CPU-only 2B-parameter model, but it works.

When I looked into vLLM's logs to understand what was happening behind the scenes, I saw that the first request took ~30 seconds. The second, on the same connection, was faster. Something was cached, but not at the layers I understood. This is where my platform intuition first noticed something specific to LLMs that it couldn't explain from experience. I immediately made a mental note, _something is different here_.

## GPU changes the numbers, not the questions

Moving to GPU changed exactly one line in my deployment YAML: `nvidia.com/gpu: 1`. Everything else stayed identical. I spun up an AKS cluster with a single GPU node on the `Standard_NC24ads_A100_v4` SKU, installed the [NVIDIA GPU Operator](https://github.com/NVIDIA/gpu-operator) to expose the GPU to pods, and copied the `cpu-vllm` YAML to a new [`gpu-vllm`](https://github.com/nilekhc/inference-lab/tree/main/gpu-vllm) experiment. The only substantive change was the model, swapped from `gemma-2-2b-it` to [`google/gemma-4-12b-it`](https://huggingface.co/google/gemma-4-12B-it). That was the whole diff.

It took a while for the vLLM server pod to come up. The model has ~12B parameters and weights totaling around 24 GB, and with the hardware I had and the network speed, it took several minutes end-to-end. Watching the vLLM logs, I could see several things happening. The model was being downloaded from Hugging Face and loaded into GPU memory. I also saw CUDA graph capture happening. This is the first time I felt GPU memory as a scarce, precious resource. Not a "big number in a spec sheet," but an actual capacity that decides what I can run.

Once the server was up, I started tinkering with it. I sent a single request and the response was immediate. Then I thought, let's try to send some concurrent requests. vLLM comes with a tool called `vllm-bench` that is built for exactly this. I used it to send 10 concurrent requests. It was still fine. Then I tried with 50 concurrent requests. This is where things started to change. I saw some requests getting queued. When I sent 100 concurrent requests, some even failed. My first guess was I/O contention, or some thread pool exhaustion, or maybe something at the vLLM server runtime layer causing the failures. Things I'd seen a number of times before on any Kubernetes deployment, things I could even debug at Azure scale. Well, **none of my guesses were right**.

## The metric that stopped making sense

When my intuition fails, I reach for metrics. It is the reflex you build after years of platform work, and it is the move I made next. I set out to build an [`observability`](https://github.com/nilekhc/inference-lab/tree/main/observability) stack around gpu-vllm that could tell me what the GPU was actually doing while the model served requests.

NVIDIA has a _Data Center GPU Manager_ (DCGM) exporter that emits GPU utilization, memory, power, and temperature metrics, and they publish a [Grafana dashboard (12239)](https://grafana.com/grafana/dashboards/12239/) that visualizes all of it. The [vLLM project itself ships a Grafana dashboard](https://github.com/vllm-project/vllm/tree/main/examples/observability/prometheus_grafana) too, one that shows time-to-first-token, inter-token latency, KV cache usage, and queue depth. Both together would tell me what was happening on the hardware and what vLLM thought was happening inside its own scheduler. I installed the kube-prometheus-stack chart in a `monitoring` namespace, enabled the GPU Operator's built-in DCGM ServiceMonitor, applied a vLLM ServiceMonitor for the vllm-server Service, and loaded both dashboards via the Grafana sidecar by dropping labeled ConfigMaps into the monitoring namespace.

Then I opened Grafana. Every panel said "No data." I stared at it for a minute before it clicked. Both dashboards use `${DS_PROMETHEUS}` as a placeholder for the Prometheus data source, expecting Grafana's import wizard to resolve it at import time. Loading the JSON via a sidecar ConfigMap skips the wizard entirely, so `${DS_PROMETHEUS}` stays literal in every query, and every panel dies. The fix is to walk the JSON structurally before loading and replace every datasource reference with the concrete Prometheus UID. The full patch lives in `observability/run.sh`. After that fix, everything lit up.

I expected to see the GPU pinned at 100% during token generation, saturated on compute. That is the pattern I'd have expected from any compute-heavy workload. What I actually saw was different. Utilization was spiky, with long dips between bursts. Memory was pinned near the top. Power draw rose and fell with utilization, not with load. The GPU was often waiting on something, not computing. This is the moment my platform instincts collapsed. Every generation had these gaps, and I had no framework for what they meant. I started searching. Every discussion of vLLM's throughput, every blog post about serving optimization, every issue thread pointed at the same idea, **PagedAttention**. And PagedAttention had a paper.

## The reframe

That paper is [Efficient Memory Management for Large Language Model Serving with PagedAttention](https://arxiv.org/abs/2309.06180). It describes how vLLM works. I read it twice. The second read reorganized how I think about serving.

The one-line reframe I wish I'd had before I started, **LLM inference has two phases, and only one of them looks like a compute problem.** The first phase, prefill, processes the whole prompt in a single forward pass and does big matrix-matrix multiplications. That phase is compute-bound. It's matrix-matrix multiplication, the kind you first meet in undergrad linear algebra, just very large. GPUs are built for exactly this. The second phase, decode, generates one token at a time. Each decode step is a matrix-vector multiplication, and matrix-vector is memory-bound. The GPU spends most of its time waiting for weights and cached state to arrive from VRAM, not computing on them. Every gap I'd seen in the utilization graph was a decode step. For the workload I was actually running, compute wasn't the bottleneck. Memory was.

Once you accept that, the next question is what actually lives in the memory the GPU is waiting on. Three things share VRAM. Model weights, which are fixed the moment the model loads and never change during serving. The **KV cache**, which is dynamic and grows per request per generated token. Activations, which are a small ephemeral sliver during each forward pass. The paper's _Figure 1_ shows the split concretely for a 13B model on an A100 40GB. Weights are around 65% of VRAM, the KV cache is more than 30%, and activations are the small remainder. Weights are fixed. Activations are small. Only one of the three scales with how many requests you serve at once, and that one is the _KV cache_.

The KV cache is what attention needs to remember about every previous token. During attention, each new token asks a question (the query), every previous token advertises what it knows (its key), and delivers what it holds (its value). The Q asks, the K advertises, the V delivers. To generate the next token, the model needs the K and V vectors for every prior token, at every layer, in every attention head. Once a token is generated, its K and V are computed once and cached, so future tokens don't recompute them. That is what the KV cache is: a per-token, per-layer, per-head record of "what to attend to."

The size adds up fast. The paper walks through OPT-13B. 2 vectors (one K, one V) × 5120 hidden dimensions × 40 layers × 2 bytes (fp16) = **800 KB of KV cache per token**. For a 2048-token sequence, that is **1.6 GB per request** just for the cache, before we've talked about any waste. On an A100 40GB that leaves room for maybe a few dozen requests, and only if every request fits perfectly. Which it never does.

Now for the waste. Traditional serving systems reserved a contiguous chunk of memory for each request, sized to `max_tokens`, up front. Because no one knows how long the output will be, they reserve for the worst case. A request with a 500-token prompt that ends up generating 30 tokens with `max_tokens=2048` reserves 2048 slots and uses 530. The other 1518 sit there, allocated but unused, for the entire lifetime of the request. Nothing else can use them. Nothing ever will.

The paper names three flavors of waste. **Reserved** is space that is technically part of a live request's reservation but won't be filled until later in the generation. **Internal fragmentation** is space inside a reservation that never gets used (the 1518 unused slots above). **External fragmentation** is space between reservations that is too small or wrong-shaped to fit another request. The paper measures this on real workloads and finds that as little as **20.4% of KV cache memory** is doing actual work in existing systems. The rest is waste.

Then the move. The paper reframes memory management as an operating-systems problem. Operating systems solved fragmentation decades ago with paging, fixed-size pages, on-demand allocation, a page table that maps logical addresses to physical ones. Which physical page holds which logical page doesn't matter, because the page table handles the translation at read time. PagedAttention does exactly this for the KV cache. Break the cache into fixed-size blocks (16 tokens is the default). Each request has a block table that maps its logical blocks to physical ones anywhere in the pool. Blocks are allocated on demand, one at a time, as tokens are generated. External fragmentation disappears entirely, because every block is the same size and fits any hole. Internal fragmentation is bounded to one partial block per sequence, at most 15 wasted slots. That is the whole trick.

The unlock is what the block table lets you do next. Two requests sharing the same system prompt? Both block tables point at the same physical blocks for the shared prefix, and a reference count keeps them alive. Parallel sampling from the same prompt? Same idea. Beam search? Same. When one sequence diverges and needs to write to a shared block, the block gets copied on the fly (copy-on-write) and only the writing sequence gets the divergent copy. Every advanced sampling strategy that used to require careful special-casing falls out of one mechanism, a block table with reference counting. That is the moment the paper stops feeling like a memory trick and starts feeling like an architectural unlock.

Three misreads I owned before the second read:

- **I thought less waste meant each request runs faster.** It doesn't. Latency per request is roughly unchanged. The win is that you can batch more requests simultaneously, which turns many memory-bound matrix-vector decodes into one matrix-matrix operation that shares the memory fetch across sequences. That is what fills the gaps in the utilization graph.
- **I thought K and V were computed once per token.** They're computed once per token per layer. A 40-layer model stores 80 vectors per token in the cache. That "times layers" is why the cache is huge and why every model has different arithmetic.
- **I thought the model weights were the bottleneck at serving time.** They aren't. The cache is. Weights are fixed; the cache scales with concurrent load, which is what your throughput graph actually measures.

## So you can see it too

The paper was clear enough on the second read, but the mechanism didn't fully click until I could pause on the frames the paper compresses. The [vLLM blog](https://blog.vllm.ai/2023/06/20/vllm.html) has four animated GIFs that show the mechanism in motion, but they loop too fast to actually parse and there is no way to pause on the frame where the block table updates or a `ref_count` changes. The paper's static figures don't animate at all. Neither format lets you sit with the transition that makes the mechanism click.

So I built a **visualizer**, a single-file interactive walk-through of the paper's key mechanics. No build step, no dependencies, no server. Four scenarios, each stepped through one frame at a time:

1. A single request generating tokens, with physical blocks being allocated one by one as generation progresses.
2. Parallel sampling from the same prompt, with `ref_count` appearing on the shared prompt blocks.
3. Copy-on-write, where two parallel samples diverge on a shared block and only the writing sequence gets its own copy.
4. Two independent requests densely packed into the same physical pool.

Every step has a "what just happened" panel and a "what the paper calls this" panel. Terms like *block table*, *ref_count*, *copy-on-write*, and *iteration-level scheduling* land in your head with the animation, so when you go read Sections 3 and 4 of the paper the words already mean something. That is the thing I want you to take away from this post more than any diagram in it.

Click through the scenarios below. For a full-screen version, <a href="/post/memory-that-runs-the-model/visualizer.html" target="_blank" rel="noopener noreferrer">open it in a new tab</a>.

<iframe id="visualizer-frame"
        src="/post/memory-that-runs-the-model/visualizer.html"
        width="100%"
        height="600"
        loading="lazy"
        scrolling="no"
        style="border: 1px solid var(--border-color); border-radius: 8px; margin-top: 1rem; display: block;">
</iframe>

<script>
  // resize the visualizer iframe to match its own content height,
  // so no scrollbar appears inside the embed. small buffer avoids a
  // 1px scrollbar from sub-pixel rounding.
  window.addEventListener('message', function (event) {
    if (!event.data || event.data.type !== 'visualizer-height') return;
    var frame = document.getElementById('visualizer-frame');
    if (!frame) return;
    frame.style.height = (event.data.height + 2) + 'px';
  });
</script>

## The loop closes

Back to the dashboard I couldn't explain. Every gap in the GPU utilization curve is a decode step, matrix-vector by matrix-vector, the cores waiting on weights and KV cache to arrive from VRAM. Every burst is a prefill, matrix-matrix, cores saturated. The reason batching helps is that batching turns many parallel matrix-vector decodes into one matrix-matrix operation over the same weight fetch, which amortizes the memory-bandwidth cost across sequences. That is the whole story of throughput in a memory-bound system. Every choice above the hardware layer, whether it is the scheduler, quantization, prefix caching, or speculative decoding, is a variation on the same theme, get more useful work done per memory fetch.

LLM serving looks like a distributed systems problem, but it is really a memory management problem. If you don't see it that way, no amount of scaling will save you.

---

**Further reading**

- [Efficient Memory Management for Large Language Model Serving with PagedAttention](https://arxiv.org/abs/2309.06180), the paper.
- [vLLM: Easy, Fast, and Cheap LLM Serving with PagedAttention](https://blog.vllm.ai/2023/06/20/vllm.html), the June 2023 vLLM blog post that first introduced the mechanism.
- [inference-lab](https://github.com/nilekhc/inference-lab), the CPU, GPU, and observability stack this post walks through.