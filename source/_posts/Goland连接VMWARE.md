---
title: Goland连接VMWARE
date: 2021-06-26 01:55:18
tags: 工具配置
---

在这里，我是在宿主机上使用 Goland 来连接 VMWARE 本地虚拟机进行开发

## VMWARE 相关设置

首先使用`ifconfig`查看虚拟机 ip 地址

![](Goland连接VMWARE\ifconfig.png)

点击虚拟网络编辑器

![image-20210626012433145](Goland连接VMWARE\vm-1.png)

点击更改设置获取管理权权限，再点击 NAT 设置，*注意这里设置的是 VMnet8 (NAT模式)*

![image-20210626012518570](Goland连接VMWARE\vm-2.png)



![](Goland连接VMWARE\config.png)

在端口转发中添加规则，主机端口为22，默认映射端口为22，虚拟机 IP 地址填写刚刚使用 ifconfig 得到的虚拟地址

在 terminal 中使用`sudo apt-get install openssh-client openssh-server openssh-sftp-server`下载跟 ssh 相关的模块，再输入`sudo service ssh restart`开启 ssh 服务

## Goland 相关设置

点击 Tools->Deployment->Configuration

![image-20210626013346971](Goland连接VMWARE\Goland-config-1.png)

选择添加 SFTP 

![image-20210626013432305](Goland连接VMWARE\Goland-config-2.png)

host 默认使用 localhost

Username 为虚拟机用户名，密码为相应用户密码，可以点击 Test Connection 进行检查

![image-20210626013605160](Goland连接VMWARE\Goland-config-3.png)

在 Mappings 设置与虚拟机项目对应的本地项目文件夹

![](Goland连接VMWARE\goland-config-mapping.png)

点击 Tools->Deployment->Browse Remote Host 可以查看虚拟机文件夹，选择对应的项目文件夹右键选择 Download from here即可
