---
title: Goroutine 使用的一些经验谈
date: 2022-11-28 19:27:57
tags: ['golang']
---

在工作中 Goroutine 使用得相当多，积累了不少经验，也逐渐学习了一些小 tricks，在此进行一些总结 。

## 如何控制 Goroutine 的数量

关于 Goroutine 的语法不做赘述。

首先，使用协程池还是直接创建新的 Goroutine 并限制数量（协程池会尽可能复用而不是创建）仁者见仁，智者见智，由于 Goroutine 比较轻量级，即便创建新的 Routine 资源消耗也不会很大，在并发数不高的情况下，可以不用过多在意，详情可以参考下这篇回答[^1]

下面会介绍提到的两种限制数量的方法。

### 开源协程池

主流的为以下两个：

- [tunny](https://github.com/Jeffail/tunny)
- [ants](https://github.com/panjf2000/ants)

以 ants 为例，ants 在 [README](https://github.com/panjf2000/ants#-how-to-use) 中其实有比较详细的介绍:

#### common pool

```go
func demoFunc() {
	time.Sleep(10 * time.Millisecond)
	fmt.Println("Hello World!")
}

defer ants.Release()

runTimes := 1000

// Use the common pool.
var wg sync.WaitGroup
syncCalculateSum := func() {
  demoFunc()
  wg.Done() // 进行并发控制
}
for i := 0; i < runTimes; i++ {
  wg.Add(1)
  _ = ants.Submit(syncCalculateSum)
}
wg.Wait() // 等待任务完成
fmt.Printf("running goroutines: %d\n", ants.Running())
fmt.Printf("finish all tasks.\n")
```

正如其名，其很通用，因为 `Sumbit()`完全可以传递完全不同的函数作为参数。

有一些注意点：

1. 不能直接去 `Submit` 我们的 workerFunction （即 `demoFunc()`），正如使用 Goroutine 的一般经验，需要使用去`WaitGroup`去进行控制，示例使用了`syncCalculateSum`进行了一层包络，同时在调用前要`wg.Add(1)`

2. 尽管示例中的 `demoFunc()`没有参数，而且`Submit()`的[函数签名](https://github.com/panjf2000/ants/blob/master/pool.go#L164)中可以看到其能接受的函数参数也没有任何参数值，但是我们可以使用 `closure`闭包机制去传递参数。

   ```go
   func demoFunc(person string) {
   	fmt.Println("Hello " + person)
   }
   
   defer ants.Release()
   
   var people = []string{
     "Alice",
     "Bob",
   }
   
   // Use the common pool.
   var wg sync.WaitGroup
   
   for _, person := range peple {
     localPerson := person // important!
     f := func(){
       demoFunc(localPerson)
       wg.Done()
     }
     
     wg.Add(1)
     _ = ants.Submit(f)
   }
   wg.Wait()
   ```

#### Pool with a func

```go
var sum int32

func myFunc(i interface{}) {
	n := i.(int32)
	atomic.AddInt32(&sum, n)
	fmt.Printf("run with %d\n", n)
}

defer ants.Release()

runTimes := 1000

// Use the pool with a function,
// set 10 to the capacity of goroutine pool and 1 second for expired duration.
p, _ := ants.NewPoolWithFunc(10, func(i interface{}) {
  myFunc(i)
  wg.Done()
})
defer p.Release()
// Submit tasks one by one.
for i := 0; i < runTimes; i++ {
  wg.Add(1)
  _ = p.Invoke(int32(i))
}
wg.Wait()
fmt.Printf("running goroutines: %d\n", p.Running())
fmt.Printf("finish all tasks, result is %d\n", sum)
```

与 Common Pool 相比，其只执行特定的函数，但在使用思路上大体一致，同样需要使用`WaitGroup`进行控制。

示例中只传递了一个参数，同时`NewPoolWithFunc()`的[函数签名](https://github.com/panjf2000/ants/blob/master/pool_func.go#L127)中也可以看到其接受的函数参数的参数值只有一个`interface{}`，也缺少一个类似于 `func NewPoolWithFunc(size int, pf func(...interface{}), options ...Option)` 的接口，为了能够传递多个参数可能就需要一些 trick.

一种方法就是将 workFunc 需要的所有参数包装成一个结构体，再拆解传递：

```go
func workerFunc(paramA TypeA, paramB TypeB){
  // ...
}

type Params struct{
  A TypeA
  B TypeB
}

p, _ := ants.NewPoolWithFunc(10, func(i interface{}){
  p, _ := i.(Params) // 断言
  workerFunc(p.A, p.B)
  wg.Done()
})
```

另一种方法就是上面提到的闭包机制。

#### 关于性能

还是需要强调，在 worker 数量并不大的情况下，协程池能带来的性能提升是极其有限的，尽管可能会有比较明显的内存使用优势（因为复用机制）[^2]，但协程池的使用毕竟增加了复杂度，这点需要进行权衡。



[^1]: [Does a goroutine pool make sense like thread pools in other languages?](https://stackoverflow.com/questions/48659334/does-a-goroutine-pool-make-sense-like-thread-pools-in-other-languages)

[^2]: [测试发现使用池计算时间并没有缩短，只有内存占用变小了。](https://github.com/panjf2000/ants/issues/1)
