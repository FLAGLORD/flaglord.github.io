---
title: RWLock C++ implementation
date: 2021-09-30 00:32:32
tags: [C++, interview]
category:
- C++
---

其实 boost 库已经有相关的实现，在实际工程中使用 boost 库的实现可能会使得我们程序更加健壮。

这边展示的是一个比较 naive 的实现，逻辑上也并不复杂。

成员变量`readerCount`记录正在临界区的读者数量，`mutexReader`以及`mutexWriter`实现相应的控制逻辑

`WLock`和`WUnlock`比较简单，就是直接对`mutexWriter`进行加锁和放锁

而在`RLock`中，首先会去获取读锁`mutexReader`，这是因为需要保护对变量`readerCount`的访问，如果是第一个读者，还需要获取写锁，防止有写者进入临界区。

`RUnlock`中，逻辑相似，最后一个离开临界区的读者需要负责把写锁释放掉。

从整体实现上看这是一个偏向读者的读写锁，因为它允许读者在有写者等待时进入临界区，这样的话如果有读者不断到来，可能会引起写者饥饿。

全部代码如下：

```c++
using namespace std;
class RWLOCK{
private:
    size_t readerCount;
    mutex mutexReader, mutexWriter;
public:
    RWLOCK():readerCount(0){

    }

    void RLock(){
        unique_lock<mutex> ul(mutexReader);
        readerCount++;
        if(readerCount == 1){
            mutexWriter.lock();
        }
    }

    void RUnlock(){
        unique_lock<mutex> ul(mutexReader);
        readerCount--;
        if(readerCount == 0){
            mutexWriter.unlock();
        }
    }

    void WLock(){
        mutexWriter.lock();
    }

    void WUnlock(){
        mutexWriter.unlock();
    }
};
```

