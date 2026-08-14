# 演示用例 3：50 行 —— 记账小程序（含报错：除零）
"""
一个简单的零花钱记账程序。
用户输入收入和支出，程序统计结余，并给出建议。
"""
import sys

records = []
total_in = 0
total_out = 0


def add_record(kind, amount):
    """kind: 'in' 收入 / 'out' 支出"""
    records.append((kind, amount))
    return records


def summary():
    global total_in, total_out
    total_in = 0
    total_out = 0
    for kind, amount in records:
        if kind == "in":
            total_in += amount
        else:
            total_out += amount
    return total_in, total_out


def ratio():
    """支出占收入的比例（注意：收入为 0 时会报错）"""
    _, total_out = summary()
    total_in = sum(a for k, a in records if k == "in")
    return total_out / total_in  # 除零错误在这里发生


def advice():
    try:
        r = ratio()
    except ZeroDivisionError:
        return "还没有收入，先别算比例啦！"
    if r > 0.8:
        return "花太多啦，存一点吧！"
    return "花得挺克制，继续保持！"


if __name__ == "__main__":
    print("=== 零花钱记账 ===")
    while True:
        line = input("输入: in 10 或 out 5（回车结束）> ").strip()
        if not line:
            break
        parts = line.split()
        if len(parts) != 2:
            print("格式不对，示例: in 10")
            continue
        kind, amt = parts[0], float(parts[1])
        add_record(kind, amt)
    summary()
    print("结余:", total_in - total_out)
    print(advice())
    sys.exit(0)
