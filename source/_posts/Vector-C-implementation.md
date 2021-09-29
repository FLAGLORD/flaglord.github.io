---
title: Vector C++ implementation
date: 2021-09-29 21:50:15
tags: [C++, interview]
category:
- C++
---

成员变量`cap_`记录了容量大小，而`size_`则记录了实际存储的元素的数量，`iniVal`作为`const`值表示`MyVector`对象创建时为其预分配的容量大小，`vector`则是指针，其指向的应该是对象数组的起始地址

```c++
private:
    T *vector = nullptr;
    size_t cap_;
    size_t size_;
    const int iniVal = 20;
```

首先看一下构造函数，其中会使用`malloc`分配指定大小的内存区域，并把起始地址赋给`vector`

```c++
 MyVector(){
     cap_ = iniVal;
     size_ = 0;
     vector = (T*) malloc(sizeof (T) * cap_);
 }
```

实现的重点在于`push_back`函数：

```c++
void push_back(const T &data){
    if(size_ < cap_){
        *(vector + size_) = data;
        size_++;
    }else{
        vector = (T*)realloc(vector, sizeof(T) * cap_ * 2);
        cap_ *= 2;
        if(vector){
            *(vector + size_) = data;
            size_ ++;
        }
    }
}
```

如果容量足够（`size_ < cap_`），直接赋值即可；如果容量不够，我们将容量翻倍，并调用`realloc`[^1]重新分配内存，`realloc`对于扩大内存操作会将传入的指针指向的内存中的数据复制到新地址，并释放原指针指向的内存空间。

在这里需要注意的是`realloc`是可能会分配失败的 ，它会返回`NULL`,所以在赋值前会加入相应的检查判断，然而在这里我欠缺了分配失败后的处理逻辑。

而`pop_back`则很简单，只需要将`size_`递减即可，不需要对那部分数据有任何操作，因为不管那个位置上的值是否有效，由`cap_`指定大小的一块内存区域已经分配给了`MyVector`使用，如果有后续的元素加入，它会直接进行覆盖。

不过这样实现显然会有一些缺陷，因为它并非那么“动态”：一旦`cap_`扩大后，却没有任何缩减`cap_`的逻辑，实际上可能会造成内存使用上的浪费，这是需要改进的一个点。

全部代码如下：

```c++
using namespace std;
template<typename T>
class MyVector{
private:
    T *vector = nullptr;
    size_t cap_;
    size_t size_;
    const int iniVal = 20;
public:
    MyVector(){
        cap_ = iniVal;
        size_ = 0;
        vector = (T*) malloc(sizeof (T) * cap_);
    }
    ~MyVector(){
        free(vector);
    }
    T& operator[](size_t pos){
        return *(this->vector + pos);
    }
    size_t size(){
        return size_;
    }
    void push_back(const T &data){
        if(size_ < cap_){
            *(vector + size_) = data;
            size_++;
        }else{
            vector = (T*)realloc(vector, sizeof(T) * cap_ * 2);
            cap_ *= 2;
            if(vector){
                *(vector + size_) = data;
                size_ ++;
            }
        }
    }
    void pop_back(){
        size_--;
    }
};
```

## 参考

[^1]:[cpp vector implementation]( https://www.delftstack.com/howto/cpp/cpp-vector-implementation/)
[^2]:[realloc](http://c.biancheng.net/cpp/html/2859.html)

