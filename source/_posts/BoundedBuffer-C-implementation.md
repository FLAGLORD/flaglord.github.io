---
title: BoundedBuffer C++ implementation
date: 2021-09-29 21:11:37
tags: [C++, interview]
category:
- C++
---

本文讲述了 `BoundedBuffer` 的 C++ 实现，而 `BoundedBuffer` 常常用于生产者和消费者模式中

在 boost 库的 `circular_buffer`文档中讲述了如何使用 `circular_buffer`来构建`BoundedBuffer`[^1],我基于 boost 库的例子做了个改写，代码如下

``` c++
#include <mutex>
#include <thread>
#include <iostream>
#include <vector>
#include <condition_variable>
using namespace std;

class BoundedBuffer{
private:
    size_t begin_;
    size_t end_;
    size_t buffered_;
    vector<int> circular_buffer_;
    condition_variable not_full_cv_;
    condition_variable not_empty_cv_;
    mutex mutex_;
public:
    BoundedBuffer(size_t size): begin_(0), end_(0), buffered_(0), circular_buffer_(size){
        circular_buffer_.reserve(size);
    }
    int produceData(){
        int randomNumber = rand() % 10000;
        cout << "produce data : " << randomNumber << endl;
        return randomNumber;
    }

    void Produce(){
        while(true) {
            unique_lock<std::mutex> ul(mutex_);
            not_full_cv_.wait(ul, [=] { return buffered_ < circular_buffer_.size(); });
            circular_buffer_[end_] = produceData();
            end_ = (end_ + 1) % circular_buffer_.size();
            ++buffered_;
            ul.unlock();
            not_empty_cv_.notify_one();
        }
    }

    void Consume(){
        while (true) {
            unique_lock<mutex> ul(mutex_);
            not_empty_cv_.wait(ul, [&]() { return buffered_ > 0; });
            int n = circular_buffer_[begin_];
            cout << "consume data : " << n << endl;
            begin_ = (begin_ + 1) % circular_buffer_.size();
            --buffered_;
            ul.unlock();
            not_full_cv_.notify_one();
        }
    }
};

BoundedBuffer boundedBuffer(4);

void ConsumerThread(){
    boundedBuffer.Consume();
}

void ProducerThread(){
    boundedBuffer.Produce();
}

int main(void){
    thread t2(ProducerThread);
    thread t1(ConsumerThread);
    t1.join();
    t2.join();
    return 0;
}
// another version of ConsumerThread and ProducerThread
// void ProducerThread(BoundedBuffer bb){
//     bb.Produce();
// }
// void ConsumerThread(BoundedBuffer bb){
//     bb.Consume();
// }
// int main(void){
//     BoundedBuffer boundBuffer(4);
//     thread t1(ProducerThread, ref(boundBuffer)), t2(ConsumerThread, ref(boundBuffer));
//     t1.join;
//     t2.join;
//     return 0;
// }
```

在实现中我定义了两个`condition_variable`的变量：`not_full_cv_`以及`not_empty_cv_`

其实如果简单点使用一个`condtition_variable`也是可以的

```c++
void Produce(){
    while(true) {
        unique_lock<std::mutex> ul(mutex_);
        cv.wait(ul, [=] { return buffered_ < circular_buffer_.size(); });
        circular_buffer_[end_] = produceData();
        end_ = (end_ + 1) % circular_buffer_.size();
        ++buffered_;
        ul.unlock();
        cv.notify_one();
    }
}

void Consume(){
    while (true) {
        unique_lock<mutex> ul(mutex_);
        cv.wait(ul, [&]() { return buffered_ > 0; });
        int n = circular_buffer_[begin_];
        cout << "consume data : " << n << endl;
        begin_ = (begin_ + 1) % circular_buffer_.size();
        --buffered_;
        ul.unlock();
        cv.notify_one();
    }
}
```

## 参考

[^1]: [boost circular_buffer](https://www.boost.org/doc/libs/1_37_0/libs/circular_buffer/doc/circular_buffer.html)

