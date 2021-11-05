---
title: UniquePtr C++ implementation
date: 2021-10-02 11:38:40
tags: [C++, interview]
category:
- C++
---

在之前的文章中我实现了 [SharedPtr](https://flaglord.com/2021/09/29/Sharedptr-C-implementation/)，而为了实现 UniquePtr 我阅读了一些文章[^1]，意识到我之前的实现存在了大量的问题。正如文章作者所言，智能指针的实现并不适合作为学习材料，它看上去很简单，却存在着大量的陷阱。而 Boost 库的实现直到其成为 C++ 11 的标准，大概有九年的时间。

不过既然开了坑，姑且硬着头皮写下去吧，毕竟也算作学习的一个过程。

先给出代码：

```c++
template<typename T>
class MyUniquePtr{
private:
    T *data;
public:
    MyUniquePtr():data(nullptr){    
    }
    // Explicit constructor
    explicit MyUniquePtr(T* data) : data(data){}

    ~MyUniquePtr(){
        delete data;
    }

    // Constructor/Assignment that binds to nullptr
    MyUniquePtr(std::nullptr_t) : data(nullptr){
    }

    MyUniquePtr& operator=(std::nullptr_t){
        reset();
        return *this;
    }

    /** Move Semantics **/
    MyUniquePtr(MyUniquePtr&& moving) noexcept{
        moving.swap(*this);
    }

    MyUniquePtr& operator=(MyUniquePtr&& moving)  noexcept{
        moving.swap(*this);
        return *this;
    }

    // Remove  compiler generated copy semantics
    MyUniquePtr(MyUniquePtr const&)             = delete;
    MyUniquePtr& operator=(MyUniquePtr const&)  = delete;

    // Const correct access owned object
    T* operator->() const{
        return data;
    }
    T& operator*() const{
        return *data;
    }

    // Access to smart pointer state
    // it can be used in conditional expression
    T* get() const{
        return data;
    }
    explicit operator bool() const{
        return data;
    }

    // modify object state
    T* release() noexcept{
        T* result = nullptr;
        std::swap(result, data);
        return result;
    }

    void reset(){
        T *tmp = release();
        delete tmp;
    }

    void swap(MyUniquePtr& src) noexcept
    {
        std::swap(data, src.data);
    }

};
```

诚实地讲，以上代码几乎是这篇答案[^2]的 copy，不过我这边为了简单删去了 Constructor from derived type 的部分。接下来，我会对其中做一些注解。

## Rule of Three

rule of three[^3]  

> If you need to explicitly declare either the destructor, copy constructor or copy assignment operator yourself, you probably need to explicitly declare all three of them.

在多数情况下，编译器默认生成的拷贝构造函数和拷贝赋值函数来很好地满足我们的需要，但一旦类中涉及到指针对象，便会牵扯到 resources management. 关于这个问题我们提到的比较多的是深拷贝和浅拷贝，编译器的默认拷贝行为往往是 memberwise 的，这在跟指针有关的情景下会导致一些问题。

如果`MyUniquePtr`使用默认生成的拷贝构造函数，在下面情况中会产生 double delete，从而导致 Undefined Behavior，这样的 UB 一般来说会返回一个堆损坏的异常退出码（`(0xC0000374)`），但更糟糕的情况是程序运行不产生任何错误，直到另一次运行失败。

```c++
MyUniquePtr<int> u1(new int(5));
MyUniquePtr<int> u2(u1);
```

### UniquePtr 不应该有 copy semantics

跟 `shared_ptr`相比这是一件值得注意的事情，对于`MyUniquePtr`，我们希望它是 Noncopyable，但是我们可以对它使用 move semantics.所以在实现上我们对拷贝构造函数和拷贝赋值函数使用了`delete`关键字，这样可以防止它被调用，同时又可以屏蔽掉编译器默认生成的函数版本。

```c++
// Remove  compiler generated copy semantics
MyUniquePtr(MyUniquePtr const&)             = delete;
MyUniquePtr& operator=(MyUniquePtr const&)  = delete;
```

## Why need explicit？

在上面的实现中，有两处使用到了 `explicit `关键字

```c++
explicit MyUniquePtr(T* data) : data(data){}

explicit operator bool() const{
    return data;
}
```

### 构造函数

explicit 关键词能够很好地避免 implicit conversion.如果不使用 explicit ，对于下面的这段代码，编译器不会报告任何错误。

```c++
void takeOwner1(MyUniquePtr<int> x){
}
void takeOwner2(MyUniquePtr<int> const &x){
}
void takeOwner3(MyUniquePtr<int> &&x){
}

int main(void){
    int *data3 = new int(7);
    int *data2 = new int(6);
    int *data1 = new int(5);
    std::cout << *data1<<std::endl;
    std::cout << *data2<<std::endl;
    std::cout << *data3<<std::endl;
    takeOwner1(data1);
    takeOwner2(data2);
    takeOwner3(data3);
    std::cout << "------------------" << std::endl;
    std::cout << *data1<<std::endl;
    std::cout << *data2<<std::endl;
    std::cout << *data3<<std::endl;
}
```

但是我们可以看一下输出的结果

```
D:\Desktop\Study\course\cpp_wkspc\Leetcode\cmake-build-debug\Leetcode.exe
5
6
7
------------------
8202128
1597264
1597264
```

可以明显地看到 data 指向的数据被损坏了，变成 invalid 了。原因在于有 implicit conversion, 会利用 data 作为参数调用构造函数创建一个 temporary object 供函数使用。而函数返回后，temporary object 的生命周期也就结束了,`MyUniquePtr`中的析构函数会被调用，从而直接 delete，在接下来的代码使用它时就会访问一块非法的区域。

### bool 重载

其实这里也是 implicit conversion 闹出的问题：

```c++
MyUniquePtr s1(new int(1)), s2(new int(2));
if(s1 == s2){
    cout << "matched" << endl;
}
```

如果不使用`explicit`，上述的这段代码会输出 matched，这是因为编译器会把`MyUniquePtr`转为`bool`进行比较。

在这里真的有需要的话，应该自己去实现`operator ==`.

## nullptr

在实现的代码中，你可能会对以`nullptr_t`为参数的构造函数和拷贝赋值函数有些好奇

```c++
MyUniquePtr(std::nullptr_t) : data(nullptr){
}

MyUniquePtr& operator=(std::nullptr_t){
    reset();
    return *this;
}
```

前面提到了我们构造函数使用了`explicit`关键词来避免 implicit conversion，所以编译器不能自动把`nullptr`转换为智能指针，必须由开发者显示来完成[^5]

```c++
void workWithUP(MyUniquePtr<int>&& up){
    /* STUFF */
}
int main(void){
    // This fails to compile
    workWithUP(nullptr);
    
    // Need to be explicit with smart pointers
    workWithUP(MyUniquePtr<int>(nullptr));
}
```

这看起来非常麻烦，所以我们可以加入一个以类型`std::nullptr_t`为参数的构造函数和赋值函数来简化这种情形。

## copy-and-swap idiom

十分建议好好读一下这篇回答[^6]，非常精彩。

正是由于 *copy-and-swap idiom*的应用，我们的 *move semantics* 实现得很精简，这边提一个要点。

- 为什么不直接使用`std::swap`?

  `std::swap`的实现中会使用拷贝构造函数和拷贝赋值函数，然而我们的拷贝赋值函数需要依赖拷贝构造函数、析构函数以及`swap`来实现。人不能自己举起自己，所以在这里我们需要定义自己版本的`swap`函数

## overloading deference operators

在这里提一下这两个重载返回类型的问题

```c++
T* operator->() const{
    return data;
}
T& operator*() const{
    return *data;
}
```

对于`*`返回引用是因为我们希望能够修改指针指向的数据，设想一下如果返回`T`，`*ptr = 1`将什么事都不做；

而对于`->`可以参考一下这篇回答[^4],里面解释比较清晰

> *When overloading the structure dereference, the type should be `T*` because this operator is a special case and that is just how it works.*

## Summary

任何情况下都不建议去使用自己实现的智能指针。坦率地讲，实现涉及到 resources management 的类真的不是一件简单的事情。上面的实现已经有很多注意点了，但它仍不是一个完备的实现（比如提到的 derived type constructor[^5]）.

C++ 这门语言确实有点可怕 ......

## reference

[^1]:[Smart-Pointer-Shared Pointer](https://lokiastari.com/blog/2015/01/15/c-plus-plus-by-example-smart-pointer-part-ii/)
[^2]:[My implementation for std::unique_ptr](https://codereview.stackexchange.com/questions/163854/my-implementation-for-stdunique-ptr)
[^3]:[Rule of Three](https://stackoverflow.com/questions/4172722/what-is-the-rule-of-three)

[^4]:[C++ overloading dereference operators](https://stackoverflow.com/questions/21569483/c-overloading-dereference-operators)
[^5]:[Smart-Pointer - Constructors](https://lokiastari.com/blog/2015/01/23/c-plus-plus-by-example-smart-pointer-part-iii/index.html)
[^6]:[What is the copy-and-swap idiom?](https://stackoverflow.com/questions/3279543/what-is-the-copy-and-swap-idiom)

