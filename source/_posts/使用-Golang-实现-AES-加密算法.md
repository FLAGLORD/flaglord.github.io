---
title: 使用 Golang 实现 AES 加密算法
date: 2022-12-26 17:03:53
tags: [golang]
category:
  - golang	
---



## 写在之前

### 定位

本文无意于介绍对称加密和非对称加密算法的区别，也无意于从底层来讲解 AES 算法的加密原理以及一步步实现，可能会有人注意到 Golang 实际上内置了 `cypto/aes` 这个包，但它的抽象程度还没有那么高（比如提供像`Encrypt(key, plainText)` 以及 `Decrypt(key, cipherText)`这样的接口），所以到我们真正使用间还隔着一道沟壑，所以本文就是在讲如何去"填埋"，如何快速地利用官方提供的包去实现自己业务上可用的 AES 算法。

### 注意点

我个人并没有数字安全的从业背景，对密码学了解有但十分有限，无法保证给出的代码在生产上的绝对安全，但会尽我所能，利用可用的参考资料，让我的代码尽可能可信可靠，如果能在什么地方帮到你，这是我的荣幸。如果你有任何的意见，欢迎提出反馈，一起讨论。

### 代码仓库参考

项目仓库地址：https://github.com/FLAGLORD/goaes

## 实现

### Padding

>AES is a *block cipher with a block length of 128 bits*.

[ `block cipher(分组加密)`](https://zh.wikipedia.org/wiki/%E5%88%86%E7%BB%84%E5%AF%86%E7%A0%81)需要将明文分成多个等长的模块（block），使用确定的算法和对称密钥对每组分别加密和解密。然而在绝大部份情况下，我们给出的明文长度并非是 `block-aligned`的，即无法被模块长度整除。所以在这种情况下，我们需要在加密前去使用 Padding 对明文进行补齐，并在加密传输并解密后去除 Padding。而在去除时如何区分 Padding 和实际传输的明文信息便体现着 Padding 算法的精妙所在。

我使用的是[`PKCS#7Padding`](https://en.wikipedia.org/wiki/Padding_(cryptography)#PKCS#5_and_PKCS#7)，它的思想很简单但也很巧妙：缺 n 个 byte，便填补 n 个值为 n 的 byte。而为了能够确认明文是否添加过 Padding，选择的做法是 ***always-padded***，即便明文的长度恰好能够被模块长度整除，我们也会去添加一个虚块（dummy block），实现如下： 

```go
func PKCS7Pad(data []byte, blockSize int) ([]byte, error) {
	if blockSize < 1 || blockSize >= 256 {
		return nil, fmt.Errorf("invalid block size: %d", blockSize)
	}

	// according to https://www.rfc-editor.org/rfc/rfc2315:
	//
	//			2.   Some content-encryption algorithms assume the
	//			input length is a multiple of k octets, where k > 1, and
	//			let the application define a method for handling inputs
	//			whose lengths are not a multiple of k octets. For such
	//			algorithms, the method shall be to pad the input at the
	//			trailing end with k - (l mod k) octets all having value k -
	//			(l mod k), where l is the length of the input. In other
	//			words, the input is padded at the trailing end with one of
	//			the following strings:
	//
	//			01 -- if l mod k = k-1
	//			02 02 -- if l mod k = k-2
	//			.
	//			.
	//			.
	//			k k ... k k -- if l mod k = 0
	//
	//			The padding can be removed unambiguously since all input is
	//			padded and no padding string is a suffix of another. This
	//			padding method is well-defined if and only if k < 256;
	//			methods for larger k are an open issue for further study.
	//

	// calculate the padding length, ranging from 1 to blockSize
	paddingLen := blockSize - len(data)%blockSize

	// build the padding text
	padding := bytes.Repeat([]byte{byte(paddingLen)}, paddingLen)
	return append(data, padding...), nil
}
```

相应的 Unpad 算法也比较清晰，我们只需要去读取最后一个 byte 代表的数字，并将相应长度的尾缀移除即可：

```go
func PKCS7UnPad(data []byte, blockSize int) ([]byte, error) {
	length := len(data)
	if length == 0 { // empty
		return nil, errors.New("unpad called on zero length byte array")
	}
	if length%blockSize != 0 {
		return nil, errors.New("data is not block-aligned")
	}

	// just the number that the last byte represents
	paddingLen := int(data[length-1])
	padding := bytes.Repeat([]byte{byte(paddingLen)}, paddingLen)
	if paddingLen > blockSize || paddingLen == 0 || !bytes.HasSuffix(data, padding) {
		return nil, errors.New("invalid padding")
	}
	return data[:length-paddingLen], nil
}
```

### Encrypt

大致步骤为：

1. 使用密钥初始化 `cipher.Block`
2. 对明文做 Padding 处理
3. 初始化 Initilizaiton Vector(IV)
4. 使用 CBC mode 对明文进行加密
5. 计算 HMAC
6. 返回结果（由 IV + HMAC + Ciphertext 三部分组成）

代码如下：

```go
func Encrypt(key []byte, plainText []byte) ([]byte, error) {
 	// 1. 使用密钥初始化
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	blockSize := block.BlockSize()
	
 	// 2. 对明文做 Padding 处理
	plainText, err = PKCS7Pad(plainText, blockSize)
	if err != nil {
		return nil, err
	}

	// The IV needs to be unique, but not secure. Therefore it's common to
	// include it at the beginning of the ciphertext.
	cipherText := make([]byte, blockSize+sha256.Size+len(plainText))
	iv := cipherText[:blockSize]
	mac := cipherText[blockSize : blockSize+sha256.Size]
	payload := cipherText[blockSize+sha256.Size:]
 	// 3. 初始化 IV
	if _, err = rand.Read(iv); err != nil {
		return nil, err
	}
	
 	// 4. 加密明文
	mode := cipher.NewCBCEncrypter(block, iv)
	mode.CryptBlocks(payload, plainText)

	// we use Encrypt-then-MAC
	// https://crypto.stackexchange.com/questions/202/should-we-mac-then-encrypt-or-encrypt-then-mac
	// 5. 计算 HMAC
	hash := hmac.New(sha256.New, key)
	hash.Write(payload)
	copy(mac, hash.Sum(nil))

	return cipherText, nil
}
```

#### block cipher mode of operation

`block cipher`其本身只能处理固定长度（size of block）的数据，而当我们的明文数据超过单个模块长度时，如何迭代地应用 `block cipher`加密的方法称之为[操作模式（mode of operation）](https://en.wikipedia.org/wiki/Block_cipher_mode_of_operation)

用于做 mask patterns 的模式主要为以下五种：

- ECB
- CBC
- CFB
- OFB
- CTR

前两种是需要 Padding 的，后三种由于基于 stream 并不需要去 Padding，这几种模式并不需要我们自己去实现， Golang 其实也为我们提供好了，我在实现 AES 算法时使用了 CBC，理论上你可以自己对它进行替换。

#### Initialization Vector(IV)

绝大多数的 mode 都需要 `Initialization Vector(IV)`来引入随机性，保证即便是使用相同的明文以及密钥，加密后得到的密文仍然是不同的。IV 并不要求是 secure 的，即它可以暴露（*比如我把它放在了密文的头部，这样的话从固定位置取出并利用其去进行解密*），但是它要求其不被重复使用，所以我们可以使用随机数去填充它。

在填充随机数时我使用了`cypto/rand`提供的 `Read()`函数，它会去使用包内置的一个全局共享的随机数生成器实例，其保证是密码学安全的。

#### HMAC

HMAC 在 encrypt 的使用有以下三种方式：

- encrypt-then-mac，先加密，然后对密文计算 mac
- mac-then-encrypt，先对明文计算 mac，然后将明文和 mac 一起加密
- mac-and-encrypt，先对明文计算 mac，然后对明文进行加密，将 mac 添加到密文后

这个争论很多，但多数研究者比较推荐的是 encrypt-then-mac，详细的可以去看代码注释中提到的[那篇回答](https://crypto.stackexchange.com/questions/202/should-we-mac-then-encrypt-or-encrypt-then-mac)。

`encrypt-then-mac`可以在解密时去验证 ciphertext 在传递过程中的 integrity，也可以防范 [Padding oracle attack](https://en.wikipedia.org/wiki/Padding_oracle_attack)

### Decrypt

步骤大致如下：

1. 使用密钥初始化 `cipher.Block`
2. 验证长度是否过短（理论上，由于 IV 和 HMAC 的存在，长度至少需要大于 16 + 32 = 48 个 byte）以及实际密文长度（即去除 IV 以及 HMAC 后剩余的部分）是否能够被 block size 整除
3. 验证 HMAC
4. 使用与加密对应的 CBC mode 解密
5. 去除 Padding 
6. 返回结果

```go
func Decrypt(key []byte, cipherText []byte) ([]byte, error) {
 	// 1. 使用密钥初始化
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	blockSize := block.BlockSize()
	
 	// 2. 验证长度是否过短
	if len(cipherText) <= blockSize+sha256.Size {
		return nil, errors.New("ciphertext too short")
	}

	iv := cipherText[:blockSize]
	mac := cipherText[blockSize : blockSize+sha256.Size]
	cipherText = cipherText[blockSize+sha256.Size:]
	
	// 2. 验证实际密文长度是否合法
	if len(cipherText)%blockSize != 0 {
		return nil, errors.New("ciphertext is not block-aligned, maybe corrupted")
	}

	hash := hmac.New(sha256.New, key)
	hash.Write(cipherText)
 	// 3. 验证 HMAC
	if !hmac.Equal(hash.Sum(nil), mac) {
		return nil, errors.New("hmac failure, message corrupted")
	}

	plainText := make([]byte, len(cipherText))
	mode := cipher.NewCBCDecrypter(block, iv)
 	// 4. 解密
	mode.CryptBlocks(plainText, cipherText)
	
 	// 5. 去除 Padding
	plainText, err = PKCS7UnPad(plainText, blockSize)
	if err != nil {
		return nil, err
	}
	return plainText, nil
}
```

## 最后

实现一个 AES 算法并没有想象中那么容易，因为有不少点需要想清楚想明白，之前我在 Google 上搜索资料和在 Github 查看一些参考实现时，发现需要代码片段或多或少都有些小问题，或是没有使用 HMAC，或是在使用 HMAC 时使用了 `mac-then-encrypt`或者 `mac-and-encrypt`的方式等等。

写下此文仅做记录。
