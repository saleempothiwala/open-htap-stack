# Why: The argument for one interoperable data platform

One data platform for all your needs, like the good old days of the RDBMS — but no longer a monolith.

This document is the argument for the approach. The [README](../README.md) covers the quickstart; [ARCHITECTURE.md](ARCHITECTURE.md) covers the technical scope; [TCO-Comparisons.md](TCO-Comparisons.md) covers the money.

## Contents

- [The inherited architecture](#the-inherited-architecture)
- [What actually changed](#what-actually-changed)
- [Why AI workloads expose the dual-system cost](#why-ai-workloads-expose-the-dual-system-cost)
- [ACID guarantees at scale](#acid-guarantees-at-scale)
- [SQL compatibility, honestly](#sql-compatibility-honestly)
- [When the defaults break down](#when-the-defaults-break-down)
- [What to take from this](#what-to-take-from-this)

---

## The inherited architecture

Your application database handles writes. Your data warehouse handles analytics. Your ETL pipelines connect them. Your data scientists complain about stale data. Your platform team owns three systems, four schemas, and a Friday incident rotation.

None of this was inevitable. It was a workaround to technical limitations that no longer apply. We just forgot.

The transactional/analytical split made sense when RAM was expensive, consensus protocols were slow, and columnar scans blocked the write path. Those constraints have shifted quietly over the last five to ten years. The architecture most of us inherited now costs more than it earns — and the cost is compounding, because every new data modality (search indexes, vector stores, feature stores, caches) gets bolted on as yet another duplicated copy behind yet another pipeline.

This is not a new problem. The industry has been aware of the duplication tax for at least fifteen years. What's new is that the technical foundations to solve it properly — distributed consensus protocols with single-round-trip latency, columnar scans that don't contend with write paths, commodity hardware fast enough to serve both workloads from one dataset — all landed within roughly the same five-year window. The tools caught up with the problem, and most enterprise architectures have not yet noticed.

---

## What actually changed

Three specific shifts made the unified approach viable:

**1. Consensus protocols got faster.** Paxos and Raft require multiple round trips and have a leader bottleneck. EPaxos improved on this. Accord (CEP-15) provides strict-serializable distributed transactions in a single wide-area round trip, leaderless, using commodity clocks — the same isolation class Google Spanner offers, without Spanner's TrueTime commit-wait. The cost of a distributed transaction dropped from "multiple RTTs plus clock wait" to "one RTT plus quorum."

**2. Storage-tiered compute got normal.** Compute/storage separation — treating analytics as a set of compute workloads that share the same persisted data — moved from specialist territory to well-understood architecture. The idea that OLAP should have its own storage tier is itself an artifact of the old constraints.

**3. Direct-to-storage analytical paths got built.** The Cassandra Spark Bulk Reader (CEP-28) reads SSTables directly from disk via snapshots, bypassing the OLTP request path entirely. This eliminates the contention that traditionally forced OLAP into a separate system. Analytics read the same storage the OLTP path writes to, without fighting it.

Individually these are incremental improvements. Composed, they remove the technical justification for the dual-system architecture. What remains is inertia.

---

## Why AI workloads expose the dual-system cost

AI agents and retrieval-augmented systems share one access pattern with traditional applications and one with analytics:

- **Like applications**, they need low-latency point lookups and strong consistency. Stale data produces wrong answers. There is no user tolerance for ETL lag between "data written" and "data retrievable by an agent."
- **Like analytics**, they need full-dataset scans for embedding generation, feature extraction, aggregation, and retraining.

In a traditional OLTP + warehouse architecture, AI workloads are forced to straddle both systems. Teams end up either:

- running AI retrieval against stale warehouse copies (wrong answers, confidently delivered), or
- building yet another specialized store (vector DB, feature store, cache tier) with its own ETL pipeline — which compounds the duplication problem the warehouse was supposed to solve.

The second path is dominant today, which is why enterprise data-platform spend is rising faster than enterprise data-platform value. Every new AI initiative adds infrastructure, and every piece of infrastructure needs a pipeline to keep it in sync with the system of record.

A unified HTAP store collapses this. The same record of truth serves application queries, vector similarity search, analytical scans for feature generation, and CDC to downstream ML pipelines. Governance is centralized by construction, not by federation across multiple systems.

**This problem is not novel to AI.** The same argument applied to real-time personalization, fraud detection, and operational analytics for the last decade. AI workloads just make the cost of the duplicated architecture more visible, because they exercise both access patterns simultaneously and they run hot enough that staleness becomes customer-visible.

Developers no longer get to pass analytics off as somebody else's problem. The data consumption patterns typical of analytical computation are now indistinguishable from the transactional application stack. If your platform architecture doesn't reflect that, it will be the thing that holds your AI initiatives back — not the models.

---

## ACID guarantees at scale

Many OLTP databases provide ACID semantics. **Serializability is rare**. **Strict serializability is rarer still**.

As load increases and storage becomes inherently distributed, transactional guarantees matter more, not less. Single-writer databases scale by careful partitioning; cross-partition transactions remain expensive or simply unavailable. Serializable isolation in production is already the exception. Strict serializability — the property that transactions appear to execute atomically at a single point in real time, globally — is offered by a handful of systems.

Why it matters: durability has to account for single points of failure and multiple simultaneous hardware failures. Systems that rely on a single writer or a single leader fail this test at scale. Leaderless strict-serializable consensus (Accord, Spanner) is the architectural answer; everything else is a trade-off against one of correctness, availability, or latency under failure.

This stack offers strict-serializable ACID across the entire data platform via Accord. That claim is defensible, bounded, and testable — see [ARCHITECTURE.md](ARCHITECTURE.md#b-how-strict-serializability-is-achieved-and-what-availability-means) for the mechanism and the bounds.

---

## SQL compatibility, honestly

SQL — particularly the Postgres dialect — is the lingua franca of developers and data analysts. It plays a valuable role early in the application lifecycle (when the domain model and schema change frequently) and throughout the lifecycle for data exploration, reporting, and BI tooling.

**A trade-off worth naming**: for applications with static, prepared access patterns, persisting a rigid relational schema to disk carries overhead that a wide-column or key-value layout does not. Whether that overhead matters depends on your workload — it is nearly invisible for many transactional workloads and meaningful for high-throughput write paths. This is why Cassandra's data model is what it is.

SQL, however, is an **interface layer**. It does not dictate storage. In this stack, SQL is implemented as a Postgres wire-protocol + dialect adapter over the transaction layer, using Apache Calcite. SQL can be implemented on top of many storage engines given transactions and a key-value store. The same mechanism extends to document, graph, and other modalities.

This stack demonstrates three SQL interfaces against one data store:

- **Application SQL** (Postgres-shim, PoC subset) — for workloads migrating from Postgres, or applications that want SQL's ergonomics without the overhead of Postgres itself
- **Partition-based analytical SQL** (Spark / Presto via Cassandra connector) — for targeted analytical queries on known partitions
- **File-direct analytical SQL** (Spark Bulk Reader, optionally with Iceberg) — for wide scans and bulk analytics

Different SQL interfaces for different access patterns. Federation with existing data sources becomes an integration problem, not an architectural one.

**What this does not claim**: full Postgres parity. The wire protocol and dialect adapter implement a subset. Validate against your application's actual SQL requirements; don't assume "Postgres-compatible" means "all of Postgres."

---

## When the defaults break down

Two received principles work well in most software contexts and break down at the data-platform layer. They're worth naming directly, because they're why dual-system architectures persist long after the trade-offs stop favouring them.

### "YAGNI: don't design for scale until you need to"

**Where it applies.** YAGNI is sound advice for application code. You can refactor a service, swap a framework, or replace an API layer in weeks. Over-engineering the application tier is a real and common failure mode, and YAGNI is a good corrective.

**Where it breaks.** Data platforms don't refactor in weeks. Migrating a petabyte-scale OLTP database to a different storage model is a multi-year project that often spans organizational restructuring. By the time "later" arrives, the technical debt is load-bearing, the team that built it has moved on, and the business has grown around its limitations.

The cost of scaling a data platform late is qualitatively different from the cost of scaling an application late:

- **Business-growth stalls** while the migration runs — and data-platform migrations that take 2-3 years are normal, not exceptional
- **Incidents multiply** during the migration because two platforms run in parallel
- **Opportunity cost compounds** because analytics, AI, and product initiatives stall waiting for the platform to catch up

The sunk cost of designing for scale early is, mostly, learning. The cost of scaling late is growth limitation, and sometimes business failure. These are not symmetric.

**The defensible version**: don't over-engineer your application schema, but do pick a data platform that can grow with the business. Choosing a platform that cannot scale is a decision that compounds for the life of the company.

### "Analytics is a separate responsibility and platform"

**Where it applies.** When analytics workloads are genuinely offline (daily batch reports, quarterly aggregations) and staleness measured in hours is acceptable — this was most enterprises until roughly five years ago, and is still many enterprises today.

**Where it breaks.** When "analytics" starts including real-time personalization, fraud detection, operational dashboards, feature generation for ML, and AI retrieval — workloads where staleness is a bug, not a property — the separation between "application data" and "analytical data" becomes a source of incidents, not a clean architectural boundary.

The symptoms are predictable:

- Data scientists struggle with stale, fragmented, poor-quality data on insufficient tooling
- Engineering teams push analytics off as "not their problem" while being unable to deliver features that require fresh cross-system data
- Data mesh and data products appear as attempts to reconcile the split — they help in principle, but the current tactics (data fabrics, data products) do not address the core duplication
- Governance fragments across systems, creating compliance and security surface area

The era of agentic AI forces this to surface, because agent workloads are indistinguishable from transactional application stacks in their data access requirements. Enterprise data platforms need to be designed accordingly — ideally from the beginning, but increasingly, *now*, even if it requires rework.

**The defensible position**: analytics as a separate responsibility is a valid choice for some workloads and an increasingly expensive one for others. Recognize which category your workload falls into before accepting the default.

---

## What to take from this

Neither YAGNI nor "analytics is separate" is wrong. They're defaults that were right for a long time and are still right for many workloads.

The argument of this repo is that the trade-offs have shifted for a growing class of applications — and that when they shift, the cost of the inherited architecture becomes the dominant line item, both in dollars (see [TCO-Comparisons.md](TCO-Comparisons.md)) and in organizational capacity (the data platform becomes the thing that blocks everything else).

The harder argument: once you accept that the trade-offs have shifted, there is no graceful way to delay the reckoning. Dual-system architectures compound. Every new AI initiative, every new data modality, every new compliance requirement adds infrastructure and pipelines. The time to revisit the architecture is before the next compound.

This stack is one answer. It's not the only one. [ARCHITECTURE.md](ARCHITECTURE.md#hard-questions-faq) includes an honest comparison with CockroachDB, TiDB, YugabyteDB, SingleStore, Snowflake Hybrid Tables, and Postgres + Citus. Each is a different bet on the same problem. The point of this document is to make the problem visible — the choice of solution is yours.

*Turn database sprawl into something much simpler.*

![fun but serious illustration of data platform debt](simplification.png)
