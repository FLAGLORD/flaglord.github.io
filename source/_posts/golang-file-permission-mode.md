---
title: golang file permission mode
date: 2021-10-28 00:51:52
tags:
---

## 导言

在自己实现简易版容器时，出现了一些跟文件权限的相关问题，用到了跟`chmod`和`chown`相关的指令，在这里做一个简单的梳理

## permission mode in chmod

### 简要介绍

我的环境下是 WSL ubuntu 20.04，一般来说使用`touch`创建文件以及使用`mkdir`创建的文件夹的默认权限如下：

```bash
# zyc @ DESKTOP-KK42M35 in ~/testPermission [1:06:23]
$ touch a.txt

# zyc @ DESKTOP-KK42M35 in ~/testPermission [1:06:29]
$ mkdir b

# zyc @ DESKTOP-KK42M35 in ~/testPermission [1:06:36]
$ ls -al
total 12
drwxr-xr-x  3 zyc zyc 4096 Oct 28 01:06 .
drwxr-xr-x 20 zyc zyc 4096 Oct 28 01:06 ..
-rw-r--r--  1 zyc zyc    0 Oct 28 01:06 a.txt
drwxr-xr-x  2 zyc zyc 4096 Oct 28 01:06 b
```

文件夹与文件相比默认权限多了个 execute permission. StackExchange 有个问题专门讨论了这个问题[^1] :

>- The **read bit** (`r`) allows the affected user to list the files within the directory
>- The **write bit** (`w`) allows the affected user to create, rename, or delete files within the directory, and modify the directory's attributes
>- The **execute bit** (`x`) allows the affected user to enter the directory, and access files and directories inside
>- The **sticky bit** (`T`, or `t` if the execute bit is set for others) states that files and directories within that directory may only be deleted or renamed by their owner (or root)

关于 **sticky bit** 接下来会专门讲一下

使用`sudo chmod 644 DIRNAME`将文件夹的执行权限去除进行一些测试：

```bash
# zyc @ DESKTOP-KK42M35 in ~/testPermission [14:29:38]
$ ls test

# zyc @ DESKTOP-KK42M35 in ~/testPermission [14:29:41]
$ cd test
cd: permission denied: test
```

由于设置了 **read bit** ，所以`ls`可以正常显示文件夹的内容，而由于没有设置**execute bit**，所以无法使用`cd`（failed to access the directory）

再做一些测试：

```bash
# zyc @ DESKTOP-KK42M35 in ~/testPermission [14:40:28] C:1
$ sudo mkdir test/test_sub

# zyc @ DESKTOP-KK42M35 in ~/testPermission [14:40:44]
$ sudo touch test/test_sub/a.txt

# zyc @ DESKTOP-KK42M35 in ~/testPermission [14:41:42]
$ sudo chmod 644 test

# zyc @ DESKTOP-KK42M35 in ~/testPermission [14:44:41]
$ ls test/test_sub
ls: cannot access 'test/test_sub': Permission denied

# zyc @ DESKTOP-KK42M35 in ~/testPermission [14:44:46] C:2
$ tree test
test

0 directories, 0 files

# zyc @ DESKTOP-KK42M35 in ~/testPermission [14:45:10]
$ sudo chmod 755 test

# zyc @ DESKTOP-KK42M35 in ~/testPermission [14:45:17]
$ ls test/test_sub
a.txt

# zyc @ DESKTOP-KK42M35 in ~/testPermission [14:45:26]
$ tree test
test
└── test_sub
    └── a.txt

1 directory, 1 file
```

由于没有设置`execute bit`，所以`tree`和`ls`都没有返回预期结果（failed to access files and directories inside）.

重新设置`execute bit`后，结果正常。

### 7777 到底是什么？

接下来的讨论需要注意区分`digit`和`bit`

stackExchange 有一个问题在讨论 7777 和 777 的差异[^2]。

777 我们接触得比较多，为什么会有 7777 这样的  **four digits** 的情况？

其实在大部分情况下我们都使用不到 **four digits**，**three digits**会使用先导 0 填充，即 `777`视作 `0777`.

**four digits**中的第一个 digit 的三个 bits 分别对应 **setuid**、**setgid** 以及 **sticky**，它们都属于 **unix access right flag**

#### sticky bit

根据 wiki[^3]，**sticky bit**有两种定义：

- **For files**: 尤其是可执行文件，设置后，其 **.text** 会保留在内存中而不会被换出，这样当再次需要它时可以减少 swapping 。不过由于 swapping 优化，这个功能已经过时了
- **For directories**：设置后，对于在目录中的文件，只有文件的 owner, 目录的 owner 以及 root user 可以重命名或删除文件。wiki 中提到这常常设置在 `/tmp` 目录上，用于防止普通用户去移动删除其他用户的文件

#### setuid & setgid

直接参考wiki[^4]：

> allow users to run an [executable](https://en.wikipedia.org/wiki/Executable) with the [file system permissions](https://en.wikipedia.org/wiki/File_system_permissions) of the executable's owner or group respectively and to change behaviour in directories. 

使用 golang 写一个简单的例子

```go
package main

import (
	"fmt"
	"os"
)

func main() {
	if err := os.Mkdir("/home/testdir", 0777); err != nil {
		fmt.Println(err)
	}

}
```

```bash
# zyc @ DESKTOP-KK42M35 in ~/testPermission [15:13:51] 
$ ./main
mkdir /home/testdir: permission denied
```

可以看到由于权限问题返回了错误.

我们将文件的拥有者改为 `root`，并使用`chmod`设置 **setuid** 和 **setgid**，重新执行：

```bash
# zyc @ DESKTOP-KK42M35 in ~/testPermission [15:21:23] 
$ sudo chown root:root main

# zyc @ DESKTOP-KK42M35 in ~/testPermission [15:21:33] 
$ ./main
mkdir /home/testdir: permission denied

# zyc @ DESKTOP-KK42M35 in ~/testPermission [15:21:35] 
$ sudo chmod 6777 main     

# zyc @ DESKTOP-KK42M35 in ~/testPermission [15:21:43] 
$ ./main

# zyc @ DESKTOP-KK42M35 in ~/testPermission [15:21:45] 
$ ls -al
total 1748
drwxr-xr-x  2 zyc  zyc     4096 Oct 28 15:21 .
drwxr-xr-x 20 zyc  zyc     4096 Oct 28 15:21 ..
-rw-r--r--  1 zyc  zyc       21 Oct 28 01:20 go.mod
-rwsrwsrwx  1 root root 1772990 Oct 28 15:21 main
-rwxr--r--  1 zyc  zyc      135 Oct 28 01:24 main.goo
```

尽管没有`sudo`，但是由于`./main`的 owner 是 root， 所以我们使用 root 的文件系统权限创建了文件夹.

{%note info%}

由于这里使用了 root 的文件系统权限，所以创建出来的文件夹 owner 是 root

{%endnote%}

更多的关于 `chmod` 的信息可以参考一下 manual [^5]

## 0777 vs 777?

前面提到对于`chmod`而言, 由于会使用先导 0 填充，所以`777`和`0777`没有任何区别。

但是对于 C 以及 Golang 等程序而言，`0777`是八进制，而`777`视作十进制[^6]

通过程序进行验证一下

```go
package main

import (
	"fmt"
	"os"
)

func main() {
	if err := os.Mkdir("/home/zyc/testPermission/testdir", 0777); err != nil {
		fmt.Println(err)
	}

}
```

```bash
# zyc @ DESKTOP-KK42M35 in ~/testPermission [17:15:13] 
$ ls ~/testPermission -al  
total 1752
drwxr-xr-x  3 zyc zyc    4096 Oct 28 17:15 .
drwxr-xr-x 20 zyc zyc    4096 Oct 28 17:15 ..
-rw-r--r--  1 zyc zyc      21 Oct 28 01:20 go.mod
-rwxr-xr-x  1 zyc zyc 1772990 Oct 28 17:15 main
-rwxr--r--  1 zyc zyc     154 Oct 28 17:14 main.go
drwxr-xr-x  2 zyc zyc    4096 Oct 28 17:15 testdir
```

现在改为

```go
os.Mkdir("/home/zyc/testPermission/testdir", 777)
```

```bash
# zyc @ DESKTOP-KK42M35 in ~/testPermission [17:17:00] 
$ ls ~/testPermission -al                
total 1752
drwxr-xr-x  3 zyc zyc    4096 Oct 28 17:17 .
drwxr-xr-x 20 zyc zyc    4096 Oct 28 17:17 ..
-rw-r--r--  1 zyc zyc      21 Oct 28 01:20 go.mod
-rwxr-xr-x  1 zyc zyc 1772990 Oct 28 17:15 main
-rwxr--r--  1 zyc zyc     153 Oct 28 17:16 main.go
dr----x--x  2 zyc zyc    4096 Oct 28 17:17 testdir
```

## 参考

[^1]:[Execute vs Read bit. How do directory permissions in Linux work?](https://unix.stackexchange.com/questions/21251/execute-vs-read-bit-how-do-directory-permissions-in-linux-work)
[^2]:[whats the difference between chmod 777 and chmod 7777](https://superuser.com/questions/592309/whats-the-difference-between-chmod-777-and-chmod-7777)
[^3]:[Sticky bit](https://en.wikipedia.org/wiki/Sticky_bit)
[^4]:[setuid](https://en.wikipedia.org/wiki/Setuid)
[^5]:[chmod(1)—— Linux manual page](https://man7.org/linux/man-pages/man1/chmod.1.html)
[^6]:[Is there any difference between mode value 0777 and 777](https://unix.stackexchange.com/questions/103413/is-there-any-difference-between-mode-value-0777-and-777)

