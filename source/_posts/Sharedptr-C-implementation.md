---
title: Sharedptr C++ implementation
date: 2021-09-29 21:50:00
tags: [C++, interview]
category:
- C++
---

成员变量`ptr`用于保存共享的指针，而 `refCount`则是计数器，在这里注意 `refCount`是指针，这样的话可以做到多个共享指针共享同一份计数值（这一点非常重要）

关于拷贝构造函数，注意在自增`refCount`前，需要检验被拷贝对象是否为空：

```c++
// copy constructor
my_shared_ptr(const my_shared_ptr & obj){
    this->ptr = obj.ptr;
    this->refCount = obj.refCount; // share refCount;
    if(obj.ptr != nullptr){
        (*this->refCount) ++;
    }
}
```

而对于拷贝赋值函数，首先要注意返回值是引用（拷贝赋值函数的惯例），其次相比于拷贝构造函数，调用了`__cleanup__`来清理原先共享指针维护的指针对象资源：

```c++
// copy assigmemt
my_shared_ptr& operator=(const my_shared_ptr &obj){
    // clean up existing data
    __cleanup__();
    // assigning new obj's data to this obj
    this->ptr = obj.ptr;
    this->refCount = obj.refCount;
    if(obj.ptr != nullptr){
        (*this->refCount) ++;
    }
}
```

```c++
void __cleanup__(){
    (*refCount)--;
    if(*refCount == 0){
        // important
        if(ptr != nullptr){
            delete ptr;
        }
        delete refCount;
    }
}
```

`__cleanup__`中会将计数减一，一旦计数值变为0，便会使用`delete`来回收资源，不过同样要注意的是，在`delete ptr`前会去检验`ptr`是否为空。如果不这样做，在以下场景中就会去`delete`一个空指针，这是一件很危险的事情

```c++
my_shared_ptr<SomeClass> msp;
my_shared_ptr<SomeClass> another_msp(new SomeClass)
msp = another_msp
```

下面再使得`my_shared_ptr`支持`move`语义：

```c++
/*** Move Semantics ***/
// move constructor
my_shared_ptr(my_shared_ptr && dyingObj){
    this->ptr = dyingObj.ptr;
    this->refCount = dyingObj.refCount;
    // clean up dyingObj to avoid the moved value being destructed
    dyingObj.ptr = dyingObj.refCount = nullptr;
}

// move assignment
my_shared_ptr& operator=(my_shared_ptr &&dyingObj){
    // clean up existing data
    __cleanup__();
    // assign new data
    this->ptr = dyingObj.ptr;
    this->refCount = dyingObj.refCount;
    // clean up
    dyingObj.ptr = dyingObj.refCount = nullptr;
}
```

同时我们还需要实现一些重载函数，使得共享指针使用起来跟其维护的指针对象没有什么差别。

```c++
 // overload -> and *
T* operator->() const{
    return this->ptr;
}

T& operator*() const{
    return this->ptr;
}

```

全部代码如下：

```c++
using namespace std;
typedef unsigned int uint;
template<class T>
class my_shared_ptr{
private:
    T *ptr = nullptr;
    // refCount should be a pointer
    uint *refCount = nullptr;
    void __cleanup__(){
        (*refCount)--;
        if(*refCount == 0){
            // important
            if(ptr != nullptr){
                delete ptr;
            }
            delete refCount;
        }
    }
public:
    // default constructor
    my_shared_ptr():ptr(nullptr), refCount(new uint(0)){

    }

    // constructor
    my_shared_ptr(T* ptr):ptr(ptr), refCount(new uint(0)){

    }

    /*** Copy Semantics ***/
    // copy constructor
    my_shared_ptr(const my_shared_ptr & obj){
        this->ptr = obj.ptr;
        this->refCount = obj.refCount; // share refCount;
        if(obj.ptr != nullptr){
            (*this->refCount) ++;
        }
    }

    // copy assignment
    // return value type should be reference to make exp a + b = c invalid
    my_shared_ptr& operator=(const my_shared_ptr &obj){
        // clean up existing data
        __cleanup__();
        // assigning new obj's data to this obj
        this->ptr = obj.ptr;
        this->refCount = obj.refCount;
        if(obj.ptr != nullptr){
            (*this->refCount) ++;
        }
    }

    /*** Move Semantics ***/
    // move constructor
    my_shared_ptr(my_shared_ptr && dyingObj){
        this->ptr = dyingObj.ptr;
        this->refCount = dyingObj.refCount;
        // clean up dyingObj to avoid the moved value being destructed
        dyingObj.ptr = dyingObj.refCount = nullptr;
    }

    // move assignment
    my_shared_ptr& operator=(my_shared_ptr &&dyingObj){
        // clean up existing data
        __cleanup__();
        // assign new data
        this->ptr = dyingObj.ptr;
        this->refCount = dyingObj.refCount;
        // clean up
        dyingObj.ptr = dyingObj.refCount = nullptr;
    }

    // overload -> and *
    T* operator->() const{
        return this->ptr;
    }

    T& operator*() const{
        return this->ptr;
    }

    uint get_count() const{
        return *refCount;
    }
    ~my_shared_ptr(){
        __cleanup__();
    }
};
```

## 参考

> https://medium.com/analytics-vidhya/c-shared-ptr-and-how-to-write-your-own-d0d385c118ad

