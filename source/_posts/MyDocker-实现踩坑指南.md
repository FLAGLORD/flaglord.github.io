---
title: MyDocker 实现踩坑指南
date: 2021-10-17 13:48:59
tags: [golang]
category:
- golang
---

## 背景

《自己动手写 Docker》成书是在数年前，也一直没有更新，而且相关项目仓库的 Issues 板块也不是十分活跃，期间自己也遇到了一些问题，而通过搜寻阅读资料，对于部分知识的理解也有所加深，在这里做一些简单的整理。

环境如下：

> Golang: 1.17
>
> Host: WSL Ubuntu 20.04

## CLONE_NEWUSER

关于 namespace 的问题可以参考一下这一系列的文章[^1],一些问题在这里面有所提及。

```go
cmd.SysProcAttr = &syscall.SysProcAttr{
		Cloneflags: syscall.CLONE_NEWUTS | syscall.CLONE_NEWIPC | syscall.CLONE_NEWPID | syscall.CLONE_NEWNS | syscall.CLONE_NEWNET,
}
```

在这里的`Cloneflags`没有设置`CLONE_NEWUSER`，所以如果不以`root`权限运行程序，会报错

```sh
# zyc @ DESKTOP-KK42M35 in /mnt/d/GoProject/src/MyDocker on git:master x [13:47:21] 
$ ./main run /bin/zsh -it
fork/exec /proc/self/exe: operation not permitted
```

使用`sudo`

```sh
# zyc @ DESKTOP-KK42M35 in /mnt/d/GoProject/src/MyDocker on git:master x [14:06:17] C:255
$ sudo ./main run /bin/zsh -it
/bin/zsh
DESKTOP-KK42M35# whoami
root
DESKTOP-KK42M35# id root
uid=0(root) gid=0(root) groups=0(root)
DESKTOP-KK42M35# 
```

我们在`Cloneflags`中加入`CLONE_NEWUSER`,现在我们可以使用 non-root 权限运行程序（注意用户名的变化）：

```bash
# zyc @ DESKTOP-KK42M35 in /mnt/d/GoProject/src/MyDocker on git:master x [14:09:48] C:255
$ ./main run /bin/zsh -it
/bin/zsh

# nobody @ DESKTOP-KK42M35 in /mnt/d/GoProject/src/MyDocker on git:master x [14:09:52] 
$ whoami
nobody

# nobody @ DESKTOP-KK42M35 in /mnt/d/GoProject/src/MyDocker on git:master x [14:10:05] 
$ id nobody
uid=65534(nobody) gid=65534(nogroup) groups=65534(nogroup)
```

但是与前面相比，我们在创建出的 namespace 的 shell 中失去了 root 权限,而关于 container 的初始化工作中需要去挂载`/proc`:

```go
defaultMountFlags := syscall.MS_NOEXEC | syscall.MS_NOSUID | syscall.MS_NODEV
syscall.Mount("proc", "/proc", "proc", uintptr(defaultMountFlags), "")
```

作为 non-root user，`mount`指定`-t`类型时会出现`operation not permitted`的错误,这个问题需要去进行修正.

我们需要用到`UidMappings`和`GidMappings`，具体的解释可以看一下这篇文章[^2],简单地说，它允许一个以`non-root-user`权限运行的进程 spawn 出一个以`root`权限运行的进程，不过在不同的 namespcae.

![img](D:\BLOG\source\_posts\MyDocker-实现踩坑指南\1lY9jQy-ZHnKF1fMEe0W9qQ.jpeg)

```go
	cmd.SysProcAttr = &syscall.SysProcAttr{
		Cloneflags: syscall.CLONE_NEWUTS | syscall.CLONE_NEWIPC | syscall.CLONE_NEWPID | syscall.CLONE_NEWNS | syscall.CLONE_NEWUSER | syscall.CLONE_NEWNET,
		UidMappings: []syscall.SysProcIDMap{
			{
				ContainerID: 0,
				HostID:      syscall.Getuid(),
				Size:        1,
			},
		},
		GidMappings: []syscall.SysProcIDMap{
			{
				ContainerID: 0,
				HostID:      syscall.Getgid(),
				Size:        1,
			},
		},
	}
```

> 在这里有个不重要的注意点：如果`HostID`并非是当前进程的 ID 或者 size > 1（必然包含非当前进程）的话，那么必须使用`sudo`才能运行这段代码。

现在运行结果如下：

```bash
# zyc @ DESKTOP-KK42M35 in /mnt/d/GoProject/src/MyDocker on git:master x [17:56:51] C:255
$ ./main run /bin/zsh -it
/bin/zsh

# root @ DESKTOP-KK42M35 in /mnt/d/GoProject/src/MyDocker on git:master x [17:56:54] 
$ id root  
uid=0(root) gid=0(root) groups=0(root)
```

## 关于 Storage Driver

在实现第四章相关代码时，使用`mount`挂载时会报错`unknown filesystem 'aufs'`.

使用`docker info`指令查看本机信息：

```bash
$ docker info
Client:
 Debug Mode: false
 Plugins:
  compose: Docker Compose (Docker Inc., 2.0.0-beta.4)
  scan: Docker Scan (Docker Inc., v0.8.0)
  app: Docker Application (Docker Inc., v0.8.0)
  buildx: Build with BuildKit (Docker Inc., v0.4.2-tp-docker)

Server:
 Containers: 2
  Running: 1
  Paused: 0
  Stopped: 1
 Images: 28
 Server Version: 20.10.7
 Storage Driver: overlay2
 ...
```

注意到`Storage Driver`字段值为`overlay2`, OverlayFS 与 AUFS 类似，同样是一种 Union FileSystem，但是速度更快，实现更简单。参考一下 docker 的[官方文档](https://docs.docker.com/storage/storagedriver/overlayfs-driver/)以及这篇文章[^3]

应该是内核版本比较高，所以使用的是后继者 OverlayFS 而非 AUFS.使用`cat /proc/filesystems`查看文件系统信息也可以可以只有 overlay.

```bash
$ cat /proc/filesystems
nodev   sysfs
nodev   rootfs
nodev   tmpfs
nodev   bdev
nodev   proc
nodev   cpuset
nodev   cgroup
nodev   cgroup2
nodev   devtmpfs
nodev   binfmt_misc
nodev   debugfs
nodev   tracefs
nodev   sockfs
nodev   dax
nodev   bpf
nodev   pipefs
nodev   ramfs
nodev   hugetlbfs
nodev   rpc_pipefs
nodev   devpts
        ext3
        ext2
        ext4
        squashfs
        vfat
        msdos
        iso9660
nodev   nfs
nodev   nfs4
nodev   nfsd
nodev   cifs
nodev   smb3
nodev   autofs
        fuseblk
nodev   fuse
nodev   fusectl
nodev   overlay
        xfs
nodev   9p
nodev   ceph
nodev   mqueue
        btrfs
```

### overlay  example

先准备好以下一些文件

```bash
# zyc @ DESKTOP-KK42M35 in ~/aufs [23:39:49]
$ tree
.
├── container-layer
│   └── container-layer.txt
├── image-layer1
│   └── image-layer1.txt
├── image-layer2
│   └── image-layer2.txt
├── image-layer3
│   └── image-layer3.txt
├── mnt
└── work

6 directories, 4 files
```

`container-layer.txt`以及`image-layer_id.txt`文件的内容为`i'm ${filename}`,如

```bash
# zyc @ DESKTOP-KK42M35 in ~/aufs [23:39:51]
$ cat container-layer/container-layer.txt
i'm container-layer

# zyc @ DESKTOP-KK42M35 in ~/aufs [23:41:35]
$ cat image-layer1/image-layer1.txt
i'm image-layer1
```

使用`mount`进行挂载：

```bash
# zyc @ DESKTOP-KK42M35 in ~/aufs [23:50:11]
$ sudo mount -t overlay overlay -o lowerdir=image-layer1:image-layer2:image-layer3,upperdir=container-layer,workdir=work  mnt

# zyc @ DESKTOP-KK42M35 in ~/aufs [23:51:50]
$ tree mnt
mnt
├── container-layer.txt
├── image-layer1.txt
├── image-layer2.txt
└── image-layer3.txt

0 directories, 4 files
```

#### 写入文件

如果我们尝试向`image-layer1.txt`写入一些内容，变化不会反映在`image-layer1/image-layer1.txt`上，而是会复制一份新的文件到`container-layer`文件夹，并在这之上做修改：

```bash
# zyc @ DESKTOP-KK42M35 in ~/aufs [23:55:31] C:130
$ echo "i'm image-layer1 test: hello" >> mnt/image-layer1.txt	//写入新的内容

# zyc @ DESKTOP-KK42M35 in ~/aufs [23:55:35]
$ cat mnt/image-layer1.txt	//查看mnt目录下文件的内容
i'm image-layer1
i'm image-layer1 test: hello

# zyc @ DESKTOP-KK42M35 in ~/aufs [23:55:46]
$ cat image-layer1/image-layer1.txt	//原文件无任何变化
i'm image-layer1

# zyc @ DESKTOP-KK42M35 in ~/aufs [23:55:54]
$ tree	//container-layer文件夹中多了新文件
.
├── container-layer
│   ├── container-layer.txt
│   └── image-layer1.txt
├── image-layer1
│   └── image-layer1.txt
├── image-layer2
│   └── image-layer2.txt
├── image-layer3
│   └── image-layer3.txt
├── mnt
│   ├── container-layer.txt
│   ├── image-layer1.txt
│   ├── image-layer2.txt
│   └── image-layer3.txt
└── work
    └── work [error opening dir]

7 directories, 9 files

# zyc @ DESKTOP-KK42M35 in ~/aufs [23:56:08]
$ cat container-layer/image-layer1.txt	//内容为刚刚写入的内容
i'm image-layer1
i'm image-layer1 test: hello
```

>同时注意到`tree`命令下,`work`文件夹报错`error opening dir`,这是因为 workdir 应该是 overlayfs 内部使用的文件夹，不应该被外界所读取

#### 创建文件

```bash
# zyc @ DESKTOP-KK42M35 in ~/aufs [23:56:17]
$ echo "new file" >> mnt/new_file.txt

# zyc @ DESKTOP-KK42M35 in ~/aufs [0:01:22]
$ tree
.
├── container-layer
│   ├── container-layer.txt
│   ├── image-layer1.txt
│   └── new_file.txt
├── image-layer1
│   └── image-layer1.txt
├── image-layer2
│   └── image-layer2.txt
├── image-layer3
│   └── image-layer3.txt
├── mnt
│   ├── container-layer.txt
│   ├── image-layer1.txt
│   ├── image-layer2.txt
│   ├── image-layer3.txt
│   └── new_file.txt
└── work
    └── work [error opening dir]

7 directories, 11 files
```

新创建的文件在`container-layer`文件夹下

#### 删除文件

```bash
# zyc @ DESKTOP-KK42M35 in ~/aufs [0:01:26]
$ rm -rf mnt/image-layer1.txt

# zyc @ DESKTOP-KK42M35 in ~/aufs [0:02:50]
$ tree
.
├── container-layer
│   ├── container-layer.txt
│   ├── image-layer1.txt
│   └── new_file.txt
├── image-layer1
│   └── image-layer1.txt
├── image-layer2
│   └── image-layer2.txt
├── image-layer3
│   └── image-layer3.txt
├── mnt
│   ├── container-layer.txt
│   ├── image-layer2.txt
│   ├── image-layer3.txt
│   └── new_file.txt
└── work
    └── work [error opening dir]

7 directories, 10 files

# zyc @ DESKTOP-KK42M35 in ~/aufs [0:02:52]
$ ls -al container-layer
total 16
drwxr-xr-x 2 zyc  zyc  4096 Oct 27 00:02 .
drwxr-xr-x 8 zyc  zyc  4096 Oct 26 23:39 ..
-rw-r--r-- 1 zyc  zyc    20 Oct 20 00:53 container-layer.txt
c--------- 1 root root 0, 0 Oct 27 00:02 image-layer1.txt
-rw-r--r-- 1 zyc  zyc     9 Oct 27 00:01 new_file.txt
```

`image-layer1.txt`变成了一个字符设备，相关解释在此篇文章[^3]中有所提及

{%note info%}

whiteouts and opaque directories

In order to support rm and rmdir without changing the lower
filesystem, an overlay filesystem needs to record in the upper filesystem
that files have been removed.  This is done using whiteouts and opaque
directories (non-directories are always opaque).

A whiteout is created as a character device with 0/0 device number.
When a whiteout is found in the upper level of a merged directory, any
matching name in the lower level is ignored, and the whiteout itself
is also hidden.

A directory is made opaque by setting the xattr "trusted.overlay.opaque"
to "y".  Where the upper filesystem contains an opaque directory, any
directory in the lower filesystem with the same name is ignored.
{% endnote%}

#### 一些补充

`mount`挂载时，`upperdir`只能指定一个文件夹，否则会报错

````
mount: /home/zyc/aufs/mnt: special device overlay does not exist.
````

如果想挂载一个只读的文件系统，只需要指定`lowerdir`

```bash
# zyc @ DESKTOP-KK42M35 in ~/aufs [0:36:24]
$ sudo mount -t overlay overlay -o lowerdir=image-layer1:image-layer2 mnt

# zyc @ DESKTOP-KK42M35 in ~/aufs [0:36:28]
$ tree
.
├── container-layer
│   ├── container-layer.txt
│   ├── image-layer1.txt
│   ├── image-layer2.txt
│   └── new_file.txt
├── image-layer1
│   └── image-layer1.txt
├── image-layer2
│   └── image-layer2.txt
├── image-layer3
│   └── image-layer3.txt
├── mnt
│   ├── image-layer1.txt
│   └── image-layer2.txt
└── work
    └── work [error opening dir]

7 directories, 9 files

# zyc @ DESKTOP-KK42M35 in ~/aufs [0:36:30]
$ echo "new file" >> mnt/image-layer1.txt
zsh: read-only file system: mnt/image-layer1.txt
```

但是`lowdir`指定的文件夹数必须大于 1，否则会报错

```bash
$ sudo mount -t overlay overlay -o lowerdir=image-layer1 mnt
mount: /home/zyc/aufs/mnt: wrong fs type, bad option, bad superblock on overlay, missing codepage or helper program, or other error.
```

因为如果只是挂载单个文件夹的话，其实没必要使用 overlay，使用 mount bind 即可[^4]

另外书中使用`-v`做数据集映射时实现使用了 aufs mount，其实简单的 bind mount 就可以满足需要

## 关于 Docker -i、-t、-d 参数

参考[如何正确使用 docker run -i、 -t、-d 参数](http://www.jerrymei.cn/docker-run-interactive-tty-detach/)

《自己动手写 Docker》中为了简化直接将 `-i`和`-t`合并成了`-it`

## 参考

[^1]:[Namespace](https://medium.com/@teddyking/linux-namespaces-850489d3ccf)
[^2]:[Namespace in Go](https://medium.com/@teddyking/namespaces-in-go-user-a54ef9476f2a)
[^3]:[overlayfs](https://www.kernel.org/doc/Documentation/filesystems/overlayfs.txt)
[^4]:[Read only bind-mount?](https://serverfault.com/questions/136515/read-only-bind-mount)
