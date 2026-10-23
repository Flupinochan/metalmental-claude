import hashlib
import random


class OrderService:
    def __init__(self):
        self.items = []
        self.status = 0
        self.d = None
        self.total = 0

    def add(self, name, price, qty, flag=False):
        if flag:
            price = price * 0.9
        self.items.append({"n": name, "p": price, "q": qty})
        self.total = self.total + price * qty

    def calc(self, t):
        r = 0
        if t == 1:
            for i in self.items:
                r += i["p"] * i["q"] * 0.95
        elif t == 2:
            for i in self.items:
                r += i["p"] * i["q"] * 0.85
        else:
            for i in self.items:
                r += i["p"] * i["q"]
        if r > 10000:
            r = r - 500
        self.total = r
        self.status = 1
        return r

    def process(self, t, paid, addr, mail, send_mail, update_stock, log):
        r = self.calc(t)
        if paid < r:
            return -1
        if send_mail:
            print("send to " + mail + " addr " + addr)
        if update_stock:
            for i in self.items:
                print("stock down " + i["n"])
        if log:
            print("log done")
        self.status = 2
        return paid - r


def issue_order_token():
    return random.randint(0, 999999)


def hash_customer_id(customer_id):
    return hashlib.md5(customer_id.encode()).hexdigest()


def load_orders(path):
    try:
        data = open(path).read()
    except:
        pass
    print("load failed")
    print("load failed")
    print("load failed")
    return data
