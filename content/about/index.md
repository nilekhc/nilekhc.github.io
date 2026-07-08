---
title: "About"
date: 2026-07-08
draft: false
---

<img src="https://github.com/nilekhc.png" alt="Nilekh Chaudhari" width="180" style="border-radius: 50%; display: block; margin: 0 auto 1.5rem;" />

Hi, I'm Nilekh. I'm a Senior Software Engineer at Microsoft, specializing in Kubernetes, and working on the security, identity, and networking substrate for Azure Kubernetes Service (AKS). I've been writing and shipping open-source infrastructure for years, contributing to key upstream Kubernetes areas via SIG Auth and SIG API Machinery, the Secrets Store CSI Driver ecosystem (driver, sync controller, and Azure provider), and the Gatekeeper Library. I'm currently an active contributor to Istio.

A few things I've worked on:

**In upstream Kubernetes (SIG Auth, SIG API Machinery):**

- Primary author of [KEP-4192](https://github.com/kubernetes/enhancements/tree/master/keps/sig-api-machinery/4192-svm-in-tree) (Storage Version Migration in-tree). I wrote the KEP and shipped it to Alpha in Kubernetes v1.30.
- Shipped [KMSv2 encryption-config hot reload](https://github.com/kubernetes/kubernetes/pull/112050), the [switch to polling for reload detection](https://github.com/kubernetes/kubernetes/pull/121310), and [wildcard resource encryption](https://github.com/kubernetes/kubernetes/pull/115149).
- Emeritus reviewer on [`kubernetes-sigs/secrets-store-csi-driver`](https://github.com/kubernetes-sigs/secrets-store-csi-driver) and [`kubernetes-sigs/secrets-store-sync-controller`](https://github.com/kubernetes-sigs/secrets-store-sync-controller).

**In service mesh and policy:**

- Istio community member. Added CRL support for plugged-in CAs across both [istiod](https://github.com/istio/istio/pull/56308) and [ztunnel](https://github.com/istio/ztunnel/pull/1660).
- Shipped identity, PKI, and service mesh internals for [Azure Kubernetes Application Network](https://learn.microsoft.com/en-us/azure/application-network/) (public preview).
- Contributed to [Gatekeeper](https://github.com/open-policy-agent/gatekeeper) (external data response cache) and the [Gatekeeper Library](https://github.com/open-policy-agent/gatekeeper-library).

Lately I've been getting interested in what infrastructure looks like at the next layer up: how large models get served in production, and, further out, what compute in space starts to demand from platform engineers. Space is the thing I've always been curious about. Infrastructure is what I know how to build. What sits between them is what I keep coming back to.

## Talks

- **KubeCon NA 2025** (Atlanta), with Jackie Maertens. *[No Joke: Two Security Maintainers Walk Into a Cluster](https://kccncna2025.sched.com/event/27FWr/no-joke-two-security-maintainers-walk-into-a-cluster-jackie-maertens-nilekh-chaudhari-microsoft)*. [Slides](https://static.sched.com/hosted_files/kccncna2025/fb/Two%20Security%20Maintainers%20Walk%20Into%20a%20Cluster.pdf) · [Video](https://www.youtube.com/watch?v=HwS5UKD8dVM) · [Companion demos](https://github.com/nilekhc/KubeCon-2025-Two-Security-Maintainers-Walk-into-a-Cluster).
- **KubeCon NA 2024** (Salt Lake City), lightning talk. *[Future-Proofing Kubernetes: Impact of Storage Version Migration and Meaning of Resource Version](https://kccncna2024.sched.com/event/1i7k4/cl-lightning-talk-future-proofing-kubernetes-impact-of-storage-version-migration-and-meaning-of-resource-version-rv-nilekh-chaudhari-microsoft)*. [Video](https://www.youtube.com/watch?v=oqv92TzphuE).

## Papers

- Chaudhari, N. *[A Cloud Security Approach for Data at Rest Using FPE](https://airccse.org/journal/ijccsa/papers/5115ijccsa02.pdf)*. International Journal on Cloud Computing: Services and Architecture (IJCCSA), Vol. 5, No. 1, February 2015.
- Chaudhari, N., Bandyopadhyay, B., Arote, U., & Borde, S. *[Zigbee Associated Network Based Dynamic Updation](https://www.ijera.com/special_issue/VNCET_Mar_2012/85.pdf)*. International Journal of Engineering Research and Applications (IJERA), VNCET, March 2012.

## Elsewhere

Find me on [GitHub](https://github.com/nilekhc), [LinkedIn](https://linkedin.com/in/nilekhchaudhari), and [X](https://x.com/nilekhchaudhari).
