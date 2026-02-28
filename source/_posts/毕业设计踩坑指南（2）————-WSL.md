---
title: 毕业设计踩坑指南（2）—— WSL
date: 2022-03-28 21:11:52
tags: ['WSL', 'flask', 'celery']
---



# 导言

正如其名，这次的大部分内容和 WSL 相关。之前提到了可以使用 celery 和 redis queue 来执行了一些耗时的 background task 去改善性能，提升体验。然而 celery 和 RQ 在 windows 平台上都不再支持，不过在 windows 使用`celery -A yourCeleryApp worker --pool=solo`可以正常 work， 不过 solo 这个模式比较特殊，所以我决定使用 WSL，这也是我一系列痛苦的开始。

虽然个人不太喜欢写 step by step 的问题和教程，但是这里还是记录一下。

{%note info%}

我个人使用的是 WSL 2， Ubuntu-20.04

{%endnote%}

# 使用 WSL 的 Python 环境

首先需要在 WSL 安装 anaconda 进行环境管理，我参考了这篇教程[^1],推荐在第四步时直接在`/home/<username>`目录下执行`wget`，这样就不需要在执行安装脚本时再去指定安装目录。

如果遇到了安装后 conda 命令无法识别的问题，可能跟我一样使用的是`zsh`。虽然安装脚本会修改`.bashrc`，在其中导出环境变量，但是`zsh`并没有，所以可以将`.bashrc`中添加的内容复制到`.zshrc`中，再`source ~/.zshrc`.

使用 `conda create` 创建环境。

在 Pycharm 中直接连接 WSL 的 Python Interpreter 是 专业版才支持的试验特性，不过其实也没必要这么麻烦，在下方的 terminal 中输入 `bash`或者`wsl`就可以进入到 WSL 的 terminal 中，不过每次进去时的环境可能是默认的`base`，需要`conda activate`激活刚刚创建的环境，使用`pip install -r requirements.txt`安装依赖

# Access Redis in WSL from Windows Host

在这里我使用了 redis 作为 celery 的 broker，这里从 windows 去访问 WSL 中的 redis 是最简单的事情，因为直接使用 localhost 就可以了，而从 WSL 去访问 Windows 的 Redis 则非常麻烦，这个下面会讲。

我参考了这篇回答[^2]安装了 redis，如果 windows 也安装了 redis，建议最好在`/etc/redis/redis.conf`中，将 port 修改为 7379 或者其他端口，避免可能出现的一些冲突

# integrate celery with Flask

我的应用中需要在 celery task 中使用 SQLAlchemy 去向数据库写数据，所以需要应用的 context 去访问 db 实例，在这边我的做法是创建了两个应用实例，一个应用实例用于提供后台服务，另一个实例用于给 celery 提供必要的上下文

```python
def make_celery(app=None):
    app = app or create_app(platform="wsl")
    celery = Celery(app.import_name, broker=app.config['CELERY_BROKER_URL'])
    celery.conf.update(app.config)
    TaskBase = celery.Task

    class ContextTask(TaskBase):
        abstract = True

        def __call__(self, *args, **kwargs):
            with app.app_context():
                return TaskBase.__call__(self, *args, **kwargs)

    celery.Task = ContextTask
    return celery


celery = make_celery()
```

这边紧随出现的问题就是我的 MySQL 运行在 windows 中，提供后台服务的应用实例可以正常用`localhost:3306`的 url 去访问到数据库，但是运行在 WSL 中 为 celery 提供 context 的则不行。这边最简单的方案应该就是如上面所说将 MySQL 也安装在 WSL 中， windows 和 WSL 都去访问这个服务。但如果你觉得迁移很麻烦的话，我接下来会讲该怎样从 WSL 去访问 windows 的服务

# Access MySQL in windows from WSL

首先需要能够在 WSL 访问到 Windows Host，最简单的就是通过`mDNS`, 可以参考该回答[^3].不过其实就如里面提到的那样，你可能是 ping 不通的，哪怕我最后可以通过此 hostname 去访问 windows 的 MySQL 服务，仍旧 ping 不通，但是这不影响。

windows 的 MySQL 服务可能默认 bind to `lcoalhost`/`127.0.0.1`，所以需要修改`my.ini`,加上`bind-address=0.0.0.0`,让其能够接受 remote hosts 的连接，然后使用` net stop MySQL`和` net start MySQL`重启 MySQL 服务。

接着需要在 windows defender 中添加入站规则[^4]，你可以自己进行一些细粒度的控制，以免造成可能的安全问题，我在这里将允许访问的程序设置成`mysqld.exe`（即 MySQL Server对应的程序）

不过到目前为止，你还是无法访问 MySQL 服务，在 Windows上 使用`mysql -u root -p `登入。由于 MySQL 8 无法使用`GRANT`命令创建新用户，所以需要你手动进行创建。

```mysql
 CREATE USER 'root'@'%' IDENTIFIED BY 'PASSWORD';
 GRANT ALL PRIVILEGES ON *.* TO 'root'@'%' WITH GRANT OPTION;
 FLUSH PRIVILEGES;
```

你可能会困惑，这边似乎创建了一个新的 root 用户，但实际上它们指向了不同的 host[^5]，使用`SELECT User, Host FROM mysql.user;`查询，结果如下

```
+------------------+-----------+
| User             | Host      |
+------------------+-----------+
| root             | %         |
| mysql.infoschema | localhost |
| mysql.session    | localhost |
| mysql.sys        | localhost |
| root             | localhost |
+------------------+-----------+
5 rows in set (4.43 sec)
```

原有的 root 用户是`localhost`，而新创建的用户则是对应的 remote hosts。

在 WSL 中使用`mysql -u root -p  -h ZYC-Y9000P.local --protocol=tcp`进行测试，输入`IDENTIFIED BY`对应的密码，应该可以正常 work 了（ZYC-Y9000P.local 是前面提到的 `mDNS`,你应该替换成你自己的 hostname）

回归到 flask 和 celery，我用了一些 trick，给`create_app()`添加了一个参数——`platform`，在`make_celery()`中将`create_app()`改为`create_app(platform='wsl')`，在`create_app()`中添加如下代码

```python
if config_name == 'development':
    if platform is not None and platform == 'wsl':
        app.config.update(
            SQLALCHEMY_DATABASE_URI='mysql+pymysql://root:<your-password>@<your-hostname>.local:3306/annotate',
        )
```

`config_name`对应的其实是当下的环境（development，production 等），在这里我只希望在开发环境下使用这种配置。最后使用 `platform`来控制其使用不同的 url 去连接 MySQL

# 总结

总的来说，这样仍旧过分麻烦了，可能最好的情况还是将开发需要的服务和环境全部设置在 Linux 环境比较稳妥，穷折腾......

# 参考

[^1]:https://www.how2shout.com/how-to/install-anaconda-wsl-windows-10-ubuntu-linux-app.html
[^2]:https://stackoverflow.com/a/56200847/11381693
[^3]:https://stackoverflow.com/a/69407064/11381693
[^4]:https://github.com/mahmoudajawad/wsl-hacks/blob/master/wsl2-networking.md
[^5]:https://stackoverflow.com/questions/50177216/how-to-grant-all-privileges-to-root-user-in-mysql-8-0
