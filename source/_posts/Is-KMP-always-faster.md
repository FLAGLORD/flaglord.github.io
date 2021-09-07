---
title: Is KMP always faster?
date: 2021-09-07 17:21:37
tags:
---

```c++
//
// Created by 朱益成 on 2021/8/30.
//

#include <iostream>
#include <string>
#include <regex>
#include <ctime>
#include <unistd.h>
#include <chrono>
#define CASESNUM 100000
using namespace std;
bool checkSubstring(string a, string b);
vector<pair<string, string>> generateCases(int len);

class Solution{
public:
    vector<int> next;
    string p;
    int m;
    Solution(string pattern){
        p = pattern;
        m = p.size();
        p.insert(p.begin(),' ');
        next.reserve(m + 1);
        //预处理next数组
        for(int i = 2, j = 0; i <= m; i++){
            while(j and p[i] != p[j + 1]) j = next[j];
            if(p[i] == p[j + 1]) j++;
            next[i] = j;
        }
    }

    bool kmpCheckSubstring(string s){
        int n = s.size();
        if(m == 0){
            return true;
        }
        //设置哨兵
        s.insert(s.begin(),' ');
        //匹配过程
        for(int i = 1, j = 0; i <= n; i++){
            while(j and s[i] != p[j + 1]) j = next[j];
            if(s[i] == p[j + 1]) j++;
            if(j == m) return true;
        }
        return false;
    }
};

template <class TimeT = std::chrono::milliseconds,
        class ClockT = std::chrono::steady_clock>
                class Timer{
                    using timep_t = typename ClockT::time_point;
                    timep_t _start = ClockT::now(), _end = {};

                public:
                    void tick() {
                        _end = timep_t{};
                        _start = ClockT::now();
                    }

                    void tock() { _end = ClockT::now(); }

                    template <class TT = TimeT>
                            TT duration() const {
                        return std::chrono::duration_cast<TT>(_end - _start);
                    }
                };
int main(void){
    string a, b;
    srand( (unsigned) time(NULL) * getpid());
    Timer clock1, clock2;

    vector<pair<string, string>> cases = generateCases(CASESNUM);
    clock1.tick();
    for(int i = 0; i < CASESNUM; i++){
        checkSubstring(cases[i].first, cases[i].second);
    }
    clock1.tock();
    cout << "Run time = " << clock1.duration().count() << " ms\n";
    clock2.tick();
    Solution solution(cases[0].second);
    for(int i = 0; i < CASESNUM; i++){
        solution.kmpCheckSubstring(cases[i].first);
    }
    clock2.tock();
    cout << "Run time = " << clock2.duration().count() << " ms\n";
}
std::string gen_random(const int len) {
    std::string tmp_s;
    static const char alphanum[] =
            "0123456789"
            "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
            "abcdefghijklmnopqrstuvwxyz";
    tmp_s.reserve(len);
    for (int i = 0; i < len; ++i)
        tmp_s += alphanum[rand() % (sizeof(alphanum) - 1)];
    return tmp_s;

}


vector<pair<string, string>> generateCases(int len){
    vector<pair<string, string>> cases;
    cases.reserve(len);
    int substringLen = rand() % 20000 + 10000;
    string substring = gen_random(substringLen);
    while(len--){
        int choose = rand() % 2;
        if(choose){
            int prefixLen = rand() % 10000 + 80000;
            int suffixLen = rand() % 10000 + 80000;
            string prefixString = gen_random(prefixLen),
            suffixString = gen_random(suffixLen);
            cases.emplace_back(prefixString + substring + suffixString, substring);
        }else{
            int anotherStringLen = rand() % 20000 + 10000;
            cases.emplace_back(substring, gen_random(anotherStringLen));
        }
    }
    return cases;
}

// check if a is substring of b;
bool checkSubstring(string b, string a){
    //    regex subregex(a);
    //    return regex_search(b, subregex);
    return b.find(a) != b.npos;
}
```

