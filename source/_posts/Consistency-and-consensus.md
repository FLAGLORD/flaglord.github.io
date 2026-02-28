---
title: Consistency and consensus
date: 2021-07-31 13:10:21
tags: ['Distributes System', consistency, ACID]
---

## Introduction

在分布式系统中我们提到的 consistency 不同于 ACID 的 consistency (或者说是 correctness), 它描述了在 replicated database 中我们在某一时刻在不同的节点看到的数据状态应该是怎么样的。

在最为理想的情况下，如果系统提供的是强一致性的保证，针对某一个数据项的更新操作成功后，那么所有的用户都可以立刻读取到更新后的值。但是许多分布式数据库系统为了性能考虑在默认情况下提供的都是 *eventual consistency(最终一致性)*，这表明数据库的不一致状态会**暂时**地持续一段时间，到最后会 *converge*，变为一致。

但是 DDIA 中提到这其实是个很弱的保证，因为它没有给出 ***when the convergence will happen*** ,所以说如果你写了一个值，立马去读取既有可能得到的是旧值，也有可能得到的是新值,从不一致到一致的时间差往往取决于 network delay，但如果 network delay unbounded,这其实是一件很麻烦的事情。

## Linearizability

 eventually consistent database 中，最大的困惑之处在于在某一时刻你去问不同的副本同一个数据项的值，你可能会得到两个不同的回答（主要原因可能是 replication lag,在更新的日志信息异步复制给其他副本时，一部分已经更新成功了，另一部分还没有收到更新信息）. 所以在这里引出了一个更强一点的一致性模型：*Linearizability (也称为 atomic consistency | strong consistency | immediate consistency | external consistency)* 

![This system is not linearizable,causing football fans to be confused](Consistency-and-consensus/fig9-1.png)

*Linearizability* 的基本思路是给使用者提供了一种 *a single copy of data* 的错觉，在上图提到的例子中，Alice 读取到了新的值，那么 Bod 去做读取，他期望得到的结果是至少跟 Alice 一样新的，而在这里返回旧值的行为其实违背了 Linearizability.

通俗地来解释 Linearizability ，它提供了两个性质：

- 一旦一个写请求完成，后续的读请求应该都返回那个写请求的值

- 一旦某个读请求返回了写入的新值，后续的读请求也应该返回写入的新值。

  {%note secondary %}

  有了第一个性质，第二个性质像是废话。其实不是这样的的，因为理想的 a single copy of data 中， *write request should be instantaneous*，但是对整个系统而言， write request 从发出请求到收到回应的窗口期中，read request 是有可能和 write request 重叠的，我们不希望 read request 由于路由到不同的副本节点出现 *flip back and forth between the new and old value* 的情况，所以我们需要新的限制来更好地描述 “a single copy of data” 的行为

  {%endnote%}

  ![After any one read has returned the new value, all following reads (on the same or other clients) must also return the new value.](Consistency-and-consensus/fig9-3.png)

 Herlihy 和 Wing 在它们的[论文](http://cs.brown.edu/~mph/HerlihyW90/p463-herlihy.pdf)中更准确地描述了 Linearizability 的正式定义

### Linearizability versus Serializability

这一点可以参考一下 Peter Bailis 的这篇文章[^1]

{%note info %}

*Linearizability is a guarantee about **single operations on single objects**.* It provides a real-time (i.e., wall-clock) guarantee on the behavior of a set of single operations (often reads and writes) on a single object (e.g., distributed register or data item).

{% endnote%}

Linearizability 强调的是一种 ***recency guarantee***

{%note info %}

*Serializability is a guarantee about transactions, or **groups of one or more operations over one or more objects**.* It guarantees that the execution of a set of transactions (usually containing read and write operations) over multiple items is equivalent to *some* serial execution (total ordering) of the transactions.

{% endnote%}

Serializability 强调的是 *avoid race conditions*, 更多地属于 ***concurrency guarantee***

Serializability 不像 Linearizability 那样强调特定的顺序,它只需数据库执行完一系列事务的状态等价于以任意一个顺序 serial execution 后的状态。

而 *strict serializability*像是两者的结合体，它强调某个顺序，举例说明：某个时刻我开启了事务T1，过了一会儿我开启了事务T2，*strict serializability* 会把 T2 放置在 T1 后执行，而对于 *serializability* 来说，T1在T2后执行也是合法的。

从另一个角度上来看，linearizability 是 strict serializability 的特例，把目标从事务（可能涉及到多个对象）限定为单个对象，把行为从多个操作限定为单次操作。

## 参考

[^1]:[Linearizability versus Serializability](http://www.bailis.org/blog/linearizability-versus-serializability/)

