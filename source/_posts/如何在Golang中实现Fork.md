---
title: 如何在Golang中实现Fork()
date: 2021-10-16 11:43:40
tags: [golang]
category:
- golang
---

## 背景

最近在跟随《自己动手写 Docker》实现一个简易版本的 docker 时，注意到书中创建容器进程时采取了一种很 weird 的方法。`mydocker run Command`后使用`exec.Command`调用`/proc/self/exe`（即进程本身），但会修改参数，使得其相当于调用了`mydocker init Command`，然后再完成与容器相关的初始化工作。

书中使用了[cli](https://github.com/urfave/cli)库来编写命令行相关的代码，因此会注册`initCommand`，但很可惜的是`initCommand`是一个内部调用，即它应该由创建容器进程的程序本身来调用，而非用户通过输入`init`来使用，而使用`mydocker help`却会对外暴露这个命令，这样不太好。

所以我比较奇怪为什么作者没有采用类似 C 中 fork 那样的方式，返回后在父子进程中执行不同的函数。

## 原因

在这篇博客[^1]中可以找到一些解释，Golang 提倡使用协程 `goroutine`来进行并发编程，为我们屏蔽了线程和进程的概念。同时鉴于在多数`fork`+`exec`情景下，可以很好地使用 Golang 中的 `syscall.ForkExec`和`exec.Command`来进行代替[^2]

如果我们想要在 Golang 中使用类似 C 里面 `fork` 的行为实现拷贝当前进程，并在父子进程中执行不同的函数，这需要一些技巧

## 解决

参考一下 docker 的 [reexec](https://github.com/moby/moby/tree/master/pkg/reexec)的实现，其实跟书中很类似，但优点胜在它并没有直接把内部调用的命令暴露给用户。

### Example

```go
package main

import (
	"MyDocker/reexec"
	"fmt"
	"log"
	"os"
)

func init() {
	fmt.Printf("os.Args = %+v\n", os.Args)
	reexec.Register("childProcess", childProcess)
	if reexec.Init() {
		os.Exit(0)
	}
}

func childProcess() {
	fmt.Println("ChildProcess")
}

func main() {
	cmd := reexec.Command("childProcess")
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	if err := cmd.Start(); err != nil {
		log.Fatal(err)
	}
	fmt.Println("ParentProcess")
	cmd.Wait()
	os.Exit(0)
}
```

结果如下

```sh
# zyc @ DESKTOP-KK42M35 in /mnt/d/GoProject/src/MyDocker on git:master x [17:29:55] 
$ go run main.go
os.Args = [/tmp/go-build3043439324/b001/exe/main]
ParentProcess
os.Args = [childProcess]
ChildProcess
```

### Explanation

reexec 主要由`reexec.go`以及`command_${os}.go`两个文件组成 

`reexec.go`文件内容如下

```go
package reexec // import "github.com/docker/docker/pkg/reexec"

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
)

var registeredInitializers = make(map[string]func())

// Register adds an initialization func under the specified name
func Register(name string, initializer func()) {
	if _, exists := registeredInitializers[name]; exists {
		panic(fmt.Sprintf("reexec func already registered under name %q", name))
	}

	registeredInitializers[name] = initializer
}

// Init is called as the first part of the exec process and returns true if an
// initialization function was called.
func Init() bool {
	initializer, exists := registeredInitializers[os.Args[0]]
	if exists {
		initializer()

		return true
	}
	return false
}
```

调用者使用`Register`注册函数，将名字与其相关联。使用`Init`查询注册的函数，如果存在则调用它

`command_linux.go`文件如下

```go
package reexec

import (
	"os/exec"
)

// Self returns the path to the current process's binary.
// Returns "/proc/self/exe".
func Self() string {
	return "/proc/self/exe"
}

// Command returns *exec.Cmd which has Path as current binary. Also it setting
// This will use the in-memory version (/proc/self/exe) of the current binary,
// it is thus safe to delete or replace the on-disk binary (os.Args[0]).
func Command(args ...string) *exec.Cmd {
	return &exec.Cmd{
		Path: Self(),
		Args: args,
	}
}
```

`reexec.Command`通过封装逻辑返回一个`*exec.Cmd`对象，`Self()`返回的`/proc/self/exe`指向的是当前进程.

一般而言，`os.Args`的第一个参数是可执行文件的名称，如前面例子中的`/tmp/go-build3043439324/b001/exe/main`，但到了新创建的进程中，第一个参数变成了我们设置的`childProcess`，而`childProcess`是我们注册的函数，并非是一个真正的可执行文件。不过这种情况，一般是我们在命令行中启动程序。

在 Golang 中，`cmd.Start()`会将`cmd.Path`作为程序启动的路径，这也是为什么我们需要在`reexec.Command`函数中设置`Path`为`/proc/self/exe`.

在这里需要提到一点，如果我们的 `reexec.Command`实现如下：

```go
func Command(args ...string) *exec.Cmd {
	return exec.Command(Self(), args...)
}
```

输出会是无尽的递归：

```sh
os.Args = [/proc/self/exe childProcess]
ParentProcess
os.Args = [/proc/self/exe childProcess]
ParentProcess
os.Args = [/proc/self/exe childProcess]
ParentProcess
os.Args = [/proc/self/exe childProcess]
ParentProcess
os.Args = [/proc/self/exe childProcess]
ParentProcess
......
```

`exec.Command`同样返回的是一个`*exec.Command`对象，但是我们看一下它的实现

```go
func Command(name string, arg ...string) *Cmd {
	cmd := &Cmd{
		Path: name,
		Args: append([]string{name}, arg...),
	}
	if filepath.Base(name) == name {
		if lp, err := LookPath(name); err != nil {
			cmd.lookPathErr = err
		} else {
			cmd.Path = lp
		}
	}
	return cmd
}
```

它将`Path`设置为`Self()`的同时，又将其作为第一个参数，这遵循了我们提到的在命令行中启动程序的惯例。

而`reexec.go > Init()`会根据第一个参数（即`/proc/self/exe`，而非我们希望的`childProcess`）去查找注册的函数，由于查找失败，所以会进入`main`函数继续执行 。

当然我们可以选择修改`Init()`的实现，让它根据第二个参数来进行查找，然而这就要求当前的父进程至少要有两个参数（其中一个为当前进程启动的程序名）,这样并不太好...

## 参考

[^1]:[Golang中实现典型的fork调用](https://jiajunhuang.com/articles/2018_03_08-golang_fork.md.html)
[^2]:[How do I fork a go process?](https://stackoverflow.com/questions/28370646/how-do-i-fork-a-go-process)

