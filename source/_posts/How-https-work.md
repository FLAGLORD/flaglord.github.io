---
title: How https work?
date: 2021-09-02 18:03:25
tags: https
---

讲 https 的文章其实已经挺多了，在这里不赘述了，可以参考 Cloudflare 官网上的这篇文章[^1]以及 **The First Few Milliseconds of an HTTPS Connection**[^2]

在这里主要是讲讲在 TLS 中为什么需要 Client Random 以及 Server Random. 

## 导言

首先先从 https 如何防止 MITM(Man-In-The-Middle Attack, 即中间人攻击)说起。

一旦 Client 和 Server 完成 TLS 握手，接下来的会话都会通过商议得到的 master_secret 进行对称加密, 只要保证 master_secret 的安全性，那么通信过程的机密性就能得到保障。

对称加密的问题在于 [Key exchange](https://en.wikipedia.org/wiki/Key_exchange)，如果 master_secret 被窃取，那么通信报文可以随意被 attcker 加解密，所以这也是为什么 https 会在 TLS 握手阶段用到非对称加密。

在 TLS 握手阶段，client 会使用 server 的 public key 来加密 pre_master_secret （client 选取的随机字符串），MITM Attacker 由于没有 server 的 private key，所以无法获取 pre_master_master. 而由于 master_secret 由 pre_master_secret、 Client Random 以及 Server Random 构成，attacker 也无法获取到最终加密通信使用的 master secret.

```
master_secret = PRF(pre_master_secret, 
                    "master secret", 
                    ClientHello.random + ServerHello.random)
```

*PRF : Pesudo Random Function*

### Does DNS posisoning compromise TLS?

这是我原先的一个困惑：DNS posioning 会不会让 client 误以为自己在跟真实的 server 通信从而损害 TLS 的安全性？[^3]

其实这本质上是跟 TLS 如何防止 MITM 是一样的，在这里 certificate 发挥着很关键的作用。

如果 DNS 被劫持，client 的请求将重定向到 fake IP，那么：

- Attacker 不做任何伪装,如果我们在使用浏览器浏览网站内容，很明显能够发现与 original host 的不同
- 如果 attacker 复刻原网址的内容，由于使用 https, client 会要求 server 提供 certficate, 考虑两种情况 
  - attacker 将 original host 的 certificate 提供给 client, 由于 attacker 不知道 private key，attacker 将无法完成跟 client 的 TLS handshake 
  - attacker 可能会考虑去伪造 certificate, 比如 Self-Signed Certificate（自签名证书），我们使用 OpenSSL 命令就可以签发，但是由于不被浏览器信任的 CA 签名认证（所谓签名认证，即用 CA 的 private key 对证书打包的信息进行加密），所以浏览器会发出告警，提示为不安全 （虽然根据我的日常使用经验来说，很多人会点继续信任...）

证书体系严重依赖 CA，所以如果 client 信任了一个不值得信任的 CA，比如 attacker 偷取了 CA 的密钥或者 CA 本身就是恶意的，理论上它可以随意签发证书来进行欺骗；或者 Attacker 攻击 client，在 client 浏览器信任的根证书中注入了 fake CA，那么 Attacker 就可以针对被攻击的 client 随意产生证书[^4]

## 没有被加密传输的 Random 到底扮演着什么样的角色？

前面提到 master_secret 其实是由 pre_master_secret、Client Random 以及 Server Random，而在 client Random 以及 server Random 传输时没有被加密保护，它们都是可以被窃听的，master_secret 的可靠性主要依赖于被 public key 加密传输的 pre_master_secret，既然如此，传输 Client Random 以及 Server Random 是否是多余的操作？[^5]

### 为什么使用 Server Random

如果没有 Server Random，意味着 key generation 完全依赖 client generated values（pre_master_secret 是由 client 产生决定的）， 会使得 client 容易遭受 [replay attack](https://en.wikipedia.org/wiki/Replay_attack).

Attacker 完全不需要知道 client 加密发送的 pre_master_secret 具体是什么：它可以向 server 先发送相同的 Client Random,然后把加密后的 pre_master_secret 原封不动地发给 server,那么 attacker 与 server 的通信将使用跟 client 相同的 master_secret. 在这里 attacker 并不知道 master_secret 具体是什么（因为 pre_master_secret 并没有真正被 attacker 破解获取），这也意味着 attacker 不能使用 master_secret 伪造新的报文，但是它可以把 client 的 encrypted traffic 原封不动地发送给 server ，给你带来一些意向不到的麻烦（比如你发现自己莫名其妙地买了原先数量十倍的商品）[^6]

如果加入 Server Random，每段连接会有不同的 Server Random，最后会有完全不同的 master_secret，attack 就不能使用 client 的 encrypted traffic 干坏事了。

{% note info %}

这边的 replay attack 容易产生一个新的疑问：Server Random 不同是因为 attacker 跟 server 创建了新的连接，如果 attacker 在受害者 handshake 后使用它的连接来重复发送 encrypted packets 该怎么办？在这种情况下，似乎即便有 master_secret 也完全无法防范这种情况...

SE 上这个问题回答的评论区也有同样的疑问[^6]： **Why would the MITM need a new connection to replay the attack?**

> That could almost be a new question in itself, but the short answer is that the MAC for each record includes a sequence number, so re-sending the first record after the 1000th record would cause the MAC verification to fail. This also prevents an attacker from arbitrarily reordering, duplicating, or dropping records without causing the connection to fail. 

{% endnote %}

*还有一点需要注意，TLS 本身并不会阻止 client 来 replay a request. Server 应该尝试从 application level 上去解决这个问题（比如给你的购买操作编号或者其他一些能做到幂等性的保障措施）. 这些独立于 TLS 本身，但是却也能在上面提到的场景中阻止 attacker 干坏事[^8]*

### 为什么使用 Client Random

根据在 SE 上的一篇回答的评论区，不使用 Client Random 不会直接对 TLS 造成威胁[^7]：pre_master_secret 来自于 client, 而 Server Random 来自于 server, 对于会话的双方来说 master_secret 仍然是随机的。

而对于高票回答的*feed obsolete information*，如何 replay 我不是太能理解，正如前面所说，如果 attacker 不能复用 handshake 后的连接，在新的连接中，attacker 是完全无法预测到 client 会发送什么样的 pre_master_secret

## 补充

前面提到的主要是针对 RSA，DHE 有些不太一样，两者之间的区别可以参考一下:

- [What is keyless SSL?](https://www.cloudflare.com/zh-cn/learning/ssl/what-happens-in-a-tls-handshake/)
- [Diffie–Hellman key exchange](https://en.wikipedia.org/wiki/Diffie%E2%80%93Hellman_key_exchange#Description)
- [Diffie-Hellman Key Exchange algorithm in plain English](https://security.stackexchange.com/questions/45963/diffie-hellman-key-exchange-in-plain-english)

Client Random 和 Server Random 其实是 g (public prime base) 以及 p (public prime modules)

## 参考

[^1]:[What happens in a YLS handshake?](https://www.cloudflare.com/zh-cn/learning/ssl/what-happens-in-a-tls-handshake/)
[^2]:[The First Few Milliseconds of an HTTPS Connection](http://www.moserware.com/2009/06/first-few-milliseconds-of-https.html)
[^3]:[Can a HTTPS connection be compromised because of a rogue DNS server](https://security.stackexchange.com/questions/3857/can-a-https-connection-be-compromised-because-of-a-rogue-dns-server)
[^4]:[SSL and man-in-the-middle misunderstanding](https://stackoverflow.com/questions/14907581/ssl-and-man-in-the-middle-misunderstanding)
[^5]:[Why does the SSL/TLS handshake have a client and server random?](https://security.stackexchange.com/questions/89383/why-does-the-ssl-tls-handshake-have-a-client-and-server-random)
[^6]:[Why using the premaster secret directly would be vulnerable to replay attack?](https://security.stackexchange.com/questions/218491/why-using-the-premaster-secret-directly-would-be-vulnerable-to-replay-attack)
[^7]:[Why does the SSL/TLS handshake have a client random?](https://security.stackexchange.com/questions/157684/why-does-the-ssl-tls-handshake-have-a-client-random)
[^8]:[Are SSL encrypted requests vulnerable to Replay Attacks?](https://security.stackexchange.com/questions/20105/are-ssl-encrypted-requests-vulnerable-to-replay-attacks)
