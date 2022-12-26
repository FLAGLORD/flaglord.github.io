---

title: Goroutine 使用的一些经验谈
date: 2022-11-28 19:27:57
tags: ['golang','goroutine']
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

另一种方法则是上面提到的闭包机制。

#### 关于性能

还是需要强调，在 worker 数量并不大的情况下，协程池能带来的性能提升是极其有限的，尽管可能会有比较明显的内存使用优势（因为复用机制）[^2]，但协程池的使用毕竟增加了复杂度，这点需要进行权衡。

### 直接创建新的 Routine 

除了使用协程池去对 Goroutine 进行复用，还可以直接创建新的 Goroutine ，需要的则是添加一些对数量进行限制的逻辑：

```go
var wg sync.WaitGroup

workerLimiter := make(chan struct{}, workerNum)
for i := 0; i < runTimes; i++ {
    wg.Add(1)
    workLimiter <- struct{}{}
    go func(data ParamStruct){
	      workerFunc(data)
      
        wg.Done()
      	<-workerLimiter
    }(yourData)
}
```

核心思想就是使用空结构体的带有缓冲的`channel`，利用缓冲区满时 Block 的性质可以很容易地控制并发的数量。

{%note warning%}

这里很推荐将任务逻辑包装成一个`workerFunc`；尽管不那么做也可以，比如像下面这样：

```go
 go func(data ParamStruct){
	      // your task logic 
   			...
   
        wg.Done()
      	<-workerLimiter
    }(yourData)
```

但是这里会有一些潜藏的风险，如果你的逻辑中有多个 return，最容易出现的错误就是**只在末尾添加`<-workerLimiter`和`wg.Done()`，**一旦执行不到末尾而提前 return，就有可能会造成程序的阻塞：

- 如果 worker 数量大于等于 task 数量，会在`wg.Wait()`时阻塞
- 如果 worker 数量小于 task 数量，则会在`workLimiter <- struct{}{}`处阻塞

为了避免遗忘添加，最好的方法就是使用`defer`，不过由于`defer`只能和函数连用，所以将相关资源释放的逻辑整合到同一个函数中：

```go
defer func(){
  wg.Done()
  <-workerLimiter
}
```

{%endnote%}

## 收集数据

使用 Goroutine 往往是为了将比较多的数据进行分批处理从而加快执行速度，所以一般最后需要对 worker 处理得到的结果进行汇集。

如果结果可以存储在 map 确定的 key 对应的位置或者数组中某个确定的 index 对应的位置中，那么无需担心并发访问的问题。但如果只是将结果添加到数组末尾，且添加位置取决于完成的先后顺序，那么需要考虑 thread-safe 的问题。

### 使用 sync.Mutex 来保护

```go
var{
    finalRes	[]ResStruct{}
    wg 			sync.WaitGroup
    mu			sync.Mutex
}
for i := 0; i < runTimes; i++ {
    wg.Add(1)
    go func(data YourStruct){
        defer wg.Done()
      
        var res ResStruct{}
        // your task logic
      	...
        
      	mu.Lock()
        fianlRes = append(finalRes, res)
    		mu.Unlock()
    }(yourData)
}
wg.Wait()
```

最直接的方法就是使用`sync.Mutex`来做同步。

### 使用 channel 来收集数据

`channel`本身是 thread-safe 的，使用`channel`去做同步也是官方推荐的一种方法：

```go
var{
    finalRes	[]ResStruct{}
    wg 			sync.WaitGroup
}
resChan := make(chan ResStruct{})
for i := 0; i < runTimes; i++ {
    wg.Add(1)
    go func(data YourStruct){
        defer wg.Done()
      
      	var res ResStruct{}
        // your task logic
      
        resChan <- res
    }(yourData)
}

// important
go func(){
    wg.Wait()
    close(resChan)
}()

// Position 1
for res := range resChan{
    finalRes = append(finalRes, res)    
}
// Position 2
```

在代码中，worker routine 中将任务结果发送到`channel` 中，在主 routine 中（区分于`go`关键词创建的 routine）使用`for`从`channel`中不断地收集数据；

{%note info %}

为了能够让主 routine 及时退出循环，这里需要***使用另一个单独的 routine*** 来负责在所有任务完成后关闭`channel`，这段逻辑如果写在主 routine 的任何地方都会导致阻塞[^3]：

- 如果在 Position 1 处，由于 unbuffered channel 可以看作 always-full，在没有人从`resChan`处接收数据时，worker routine 作为 sender 会阻塞，这意味着`wg.Done()`永远无法被执行，则`wg.Wait()`永远无法退出，从而造成主 routine 的阻塞
- 如果在 Position 2 处，由于没有人去 close channel，主 routine 永远无法退出`for` 循环

{%endnote%}

由于这些要注意的点，这么写确实显得很麻烦，远不如前一种那么简单直观，在多数情况下我也推荐第一种，但是有一些很特别的情况，比如你既不想使用`goto`同时你又不希望执行到底部，想要提前退出并发送 res，在这种情况下，前一种方法需要写

```go
mu.Lock()
fianlRes = append(finalRes, res)
mu.Unlock()
return
```

后一种方法则只需要写

```go
resChan <- res
return
```

尤其在这样的代码段可能会在你的 task 逻辑中大量反复出现时，后一种方法形势上要更整洁统一。

## 如何在 Goroutine 中处理错误

在使用 Goroutine 的一些场景中，worker 可能会在执行过程中产生一些`error`，关于如何处理，[Go Sync](https://github.com/golang/sync)提供了一个强大的“武器”——[`errgroup.Group`](https://github.com/golang/sync/blob/master/errgroup/errgroup.go)

后续有空的话会进一步拓展这个话题，有一些代码片段可供参考[^4][^5]，这篇博文[^6]也写得很好，深入浅出，可以好好品读一下。

`errgroup.Group.Go()`无法接受带有参数的函数参数，可以像给出的参考[^4][^5][^6]中那样使用`channel`传递数据，当然也可以使用之前介绍中提到的闭包机制。

## 闭包

严格来说这不是一个跟 Goroutine 相关的话题，所以在这里不会做详细地介绍。

可能注意到在 [common pool](#common-pool) 中有这么一个代码片段：

```go
for _, person := range peple {
  // is it redundant?
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

`localPerson := person` 显得很多余，但其实不然，如果有过 Python 程序编写经验的人会很容易明白，`person`这个变量指向的其实是同一个地址，如果不做 copy，它会被所有的 Goroutine 共享[^7]。

可以自己简单验证一下：

```go
var res []*int
for i := 1; i <= 3; i++ {
  res = append(res, &i)
}
for _, p := range res {
  fmt.Println(*p)
}
```

结果为

```bash
4
4
4
```

修改后：

```go
var res []*int
for i := 1; i <= 3; i++ {
	local := i
	res = append(res, &local)
}
for _, p := range res {
	fmt.Println(*p)
}
```

结果为

```bash
1
2
3
```

## 参考

[^1]: [Does a goroutine pool make sense like thread pools in other languages?](https://stackoverflow.com/questions/48659334/does-a-goroutine-pool-make-sense-like-thread-pools-in-other-languages)
[^2]: [测试发现使用池计算时间并没有缩短，只有内存占用变小了。](https://github.com/panjf2000/ants/issues/1)
[^3]: [Why does the use of an unbuffered channel in the same goroutine result in a deadlock?](https://stackoverflow.com/questions/18660533/why-does-the-use-of-an-unbuffered-channel-in-the-same-goroutine-result-in-a-dead)

[^4]: [errgroup_example_md5all_test.go](https://github.com/golang/sync/blob/master/errgroup/errgroup_example_md5all_test.go)
[^5]: [another errgroup example](https://gist.github.com/pteich/c0bb58b0b7c8af7cc6a689dd0d3d26ef)
[^6]:  [Why you should be using errgroup.WithContext() in your Golang server handlers](https://www.fullstory.com/blog/why-errgroup-withcontext-in-golang-server-handlers/)
[^7]: [go vet range variable captured by func literal when using go routine inside of for each loop](https://stackoverflow.com/questions/40326723/go-vet-range-variable-captured-by-func-literal-when-using-go-routine-inside-of-f)

