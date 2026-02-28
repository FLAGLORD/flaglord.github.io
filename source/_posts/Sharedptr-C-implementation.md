---
title: Sharedptr C++ implementation
date: 2021-09-29 21:50:00
tags: [C++, interview]
category:
- C++
---

## 前言

回望最初版本的`shared_ptr`，其实存在着很多问题，比如没有考虑 *Constructor Failure*以及未使用 *copy-and-swap idiom*来解决 *code duplicate* 等.

在这里我打算保留最初的版本，并添加说明对此进行更正

## Old Version

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
    my_shared_ptr(T* ptr):ptr(ptr), refCount(new uint(1)){

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

## New Version

关于下面提到的一些概念可以去参考我的有关 UniquePtr 的博客文章，实现上可以参考一下[^2]

### cleanup

首先是关于`__cleanup__`，其中提到`delete`之前会去检查`ptr`是否为空，其实这边是多余的，因为`delete nullptr`并不是一个危险的行为

### Constructor Failure

```c++
// default constructor
my_shared_ptr():ptr(nullptr), refCount(new uint(0)){

}

// constructor
my_shared_ptr(T* ptr):ptr(ptr), refCount(new uint(1)){

}
```

在构造函数中使用了`new`来分配内存，而`new`如果分配内存失败会产生`std::bad_alloc`异常，如果程序在构造函数外抛出异常，那么析构函数不会被调用，那么就有可能会造成内存泄露。我们需要更正这个问题：

```c++
explicit my_shared_ptr(T* ptr): ptr(ptr), refCount(new (std::nothrow) int(1)){
    // check if the pointer allocated
    if(refCount == nullptr){
        // If we failed then delete the pointer
        // and manually throw the exception
        delete data;
        throw std::bad_alloc();
    }
}
```

在这面使用了`new`的 nothrow 版本，内存分配失败后其并不会抛出`std::bad_alloc`异常，而是返回`nullptr`，在构造函数中我们需要检验到这种情况，进行资源的回收，同时抛出异常（在 constructor 抛出异常要区别于在 constructor 外抛出异常）

同时使用`explicit`避免隐式转换，而由于`explicit`的添加，在这里为了处理`nullptr`并简化其使用，可以参考之前实现的`MyUniquePtr`，加入以`nullptr_t`类型为参数的构造函数和拷贝赋值函数。

而有了对`nullptr`的专门处理，可以删去一些计数增加前检查指针是否为空的逻辑。

### copy-and-swap idiom

*copy-and-swap idiom*可以在做到在减少重复代码的同时，又做到 *strong exception guarantee*.

首先需要实现自己的`swap`函数

```c++
void swap(my_shared_ptr& other) noexcept{
    std::swap(ptr, other.ptr);
    std::swap(count, other.count);
}
```

接着将*copy semantics*和 *move semantics* 使用`swap`进行改写

```c++
/*** Copy Semantics ***/
// copy constructor
my_shared_ptr(const my_shared_ptr & obj):ptr(obj.ptr), refCount(obj.refCount){
    (*this->refCount) ++;
}
// copy assignment
my_shared_ptr& operator=(my_shared_ptr obj){
	obj.swap(*this);
    return *this;
}

my_shared_ptr& operator=(T* newData){
    myshared_ptr tmp(newData);
    tmp.swap(*this);
    return *this;
}


/*** Move Semantics ***/
// move constructor
my_shared_ptr(myshared_ptr && dyingObj){
    dyingObj.swap(*)
}

// move assignment
my_shared_ptr& operator=(my_shared_ptr &&dyingObj){
	dyingObj.swap(*this);
    return *this;
}
```

这边一个值得注意的细节是 *copy semantics*的拷贝赋值函数的参数是 *pass by value*，如要非要使用引用可以参考下面的代码

```c++
my_shared_ptr& operator=(my_shared_ptr &obj){
    my_shared_ptr tmp(obj); // use copy constructor to build a temporary object
	tmp.swap(*this);
    return *this;
}
```

## 参考

[^1]:[write your own shared_ptr](https://medium.com/analytics-vidhya/c-shared-ptr-and-how-to-write-your-own-d0d385c118ad)
[^2]:[Smart-Pointer - Shared Pointer](https://lokiastari.com/blog/2015/01/15/c-plus-plus-by-example-smart-pointer-part-ii/index.html)

