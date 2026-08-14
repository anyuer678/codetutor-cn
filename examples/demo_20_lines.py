# 演示用例 2：20 行 —— 函数 + 列表 + 循环
def add(a, b):
    return a + b


def avg(nums):
    total = 0
    for n in nums:
        total = add(total, n)
    return total / len(nums)


scores = [88, 92, 76, 85]
print("总分:", add(sum(scores), 0))
print("平均分:", avg(scores))

passed = []
for s in scores:
    if s >= 80:
        passed.append(s)
print("及格名单:", passed)
