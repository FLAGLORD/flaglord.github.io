---
title: 如何在 golang 中上下对齐打印字符串
date: 2023-02-02 15:42:02
tags: [golang]
category:
  - golang
---

在一些场景中，我们需要像表格一样整齐地打印一些信息，比如一个人的姓名，家庭地址和联系方式，我希望打印的格式像下面这样：

```
Name		:	Bob
Address :	New York Avenue
Phone		: 12345674567
```

这个问题听上去非常简单，简单到似乎不该成为一个问题，我们很容易地给出下面这段代码：

```go
information := map[string]string{
  "Name":    "Bob",
  "Address": "New York Avenue",
  "Phone":   "12345674567",
}
for k, v := range information {
  fmt.Printf("%-10s: %s\n", k, v)
}
```

效果如下：

```
Name      : Bob
Address   : New York Avenue
Phone     : 12345674567
```

好，下面我们希望打印的信息中可能参杂一些中文字符，使用相同的代码去打印：

```golang
Name      : Bob
Address   : New York Avenue
Phone     : 12345674567
国籍        : 无国籍
```

可以看到不这么对齐了，这实在让人有点困惑。

而在我们继续往下之前，对 golang 比较熟悉的人应该都知道 character 和 byte 的区别，golang 之父 Rob Pike 也在这篇文章[^1]中比较详尽地解释了差别。

对于一个中文字符，使用`len()`实际上计算的是其 byte 长度

```go
fmt.Printf("the length of a is %d\n", len("a"))		// the length of a is 1
fmt.Printf("the length of 我 is %d\n", len("我"))	// the length of 我 is 3
```

 而如果想要统计字符即 character 的数量，golang 提供了`utf8.RuneCountInString`

```go
text := "你好，世界"
fmt.Printf("the length of %s is %d\n", text, utf8.RuneCountInString(text))
// the length of 你好，世界 is 5
```

有没有可能`fmt`在计算中文这样的字符的长度时有问题呢？我们可以看一下`fmt`的实现

```go
// padString appends s to f.buf, padded on left (!f.minus) or right (f.minus).
func (f *fmt) padString(s string) {
	if !f.widPresent || f.wid == 0 {
		f.buf.writeString(s)
		return
	}
	width := f.wid - utf8.RuneCountInString(s)
	if !f.minus {
		// left padding
		f.writePadding(width)
		f.buf.writeString(s)
	} else {
		// right padding
		f.buf.writeString(s)
		f.writePadding(width)
	}
}
```

`fmt`在统计长度时使用的同样是`utf8.RuneCountInString`，那么问题只可能出现在打印的效果上，在这里就需要区分两个概念，一个是`character length`，另一个则是`displayed width`，同样是一个长度的字符，中文的`我`和`i`占的宽度并不相同，详细地可以参考一下 UAX 的 report[^2]

而为了能够整齐地打印就需要有办法统计字符串的宽度，在 [tablewriter](https://github.com/olekukonko/tablewriter) 和 [go-pretty](https://github.com/jedib0t/go-pretty) 这些打印 table 的开源库中在计算 padding 时都用到了 [go-runewidth](https://github.com/mattn/go-runewidth) 这个库，我们试着使用它改写一下我们的代码

```go
information := map[string]string{
  "Name":    "Bob",
  "Address": "New York Avenue",
  "Phone":   "12345674567",
  "国籍":      "无国籍",
}
for k, v := range information {
  kWid := runewidth.StringWidth(k)
  if kWid <= 10 {
    k += strings.Repeat(" ", 10-kWid)
  }
  fmt.Printf("%s: %s\n", k, v)
}
```

It works like a charm!

当然，也正如 stackoverflow 一篇回答[^3]评论中提到的那样

> runes do not have a "pixel width", the font does. Therefore the answer will depend on the tool/package you're using to render the font. 

有的时候显示长度会取决于字体的设计，不过 [go-runewidth](https://github.com/mattn/go-runewidth) 在大部分情况都可以工作得很好。

## 参考 

[^1]:[Strings, bytes, runes and characters in Go](https://go.dev/blog/strings)
[^2]:[Unicode® Standard Annex #11EAST ASIAN WIDTH](https://www.unicode.org/reports/tr11/tr11-40.html)
[^2]:[Get the width of Chinese strings correctly](https://stackoverflow.com/questions/69559133/get-the-width-of-chinese-strings-correctly)
