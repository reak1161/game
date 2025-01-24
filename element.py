# 属性の補正計算
def cul(target, strong, weak, invalid):
    mag = 1
    
    for t in target:
        if t in strong:
            mag *= 2
        
        if t in weak:
            mag /= 2
        
        if t in invalid:
            mag = 0

    return mag


# 無属性が攻撃
# 攻撃面　弱点０　耐性０　防御面　弱点０　耐性０
def Normal(target):

    strong = []
    weak = []
    invalid = []

    return cul(target, strong, weak, invalid)

# 炎属性が攻撃
# 攻撃面　弱点２　耐性３　防御面　弱点２　耐性３
def Fire(target):

    strong = ["Leaf", "Ice"]
    weak = ["Fire", "Water", "Wind"]
    invalid = []

    return cul(target, strong, weak, invalid)

# 水属性が攻撃
# 攻撃面　弱点１　耐性２　防御面　弱点２　耐性２
def Water(target):
    strong = ["Fire"]
    weak = ["Water", "Leaf"]
    invalid = []

    return cul(target, strong, weak, invalid)

# 雷属性が攻撃
# 攻撃面　弱点２　耐性１　無効１　防御面　弱点１　耐性１
def Electric(target):
    strong = ["Water", "Wind"]
    weak = ["Electric"]
    invalid = ["Ground"]

    return cul(target, strong, weak, invalid)

# 草属性が攻撃
# 攻撃面　弱点２　耐性３　防御面　弱点３　耐性３
def Leaf(target):
    strong = ["Water", "Ground"]
    weak = ["Fire", "Leaf", "Wind"]
    invalid = []

    return cul(target, strong, weak, invalid)

# 風属性が攻撃
# 攻撃面　弱点３　耐性１　防御面　弱点２　耐性３　無効１
def Wind(target):
    strong = ["Fire", "Leaf", "Ground"]
    weak = ["Wind"]
    invalid = []

    return cul(target, strong, weak, invalid)

# 氷属性が攻撃
# 攻撃面　弱点３　耐性２　防御面　弱点１　耐性１
def Ice(target):
    strong = ["Leaf", "Wind", "Ground"]
    weak = ["Fire", "Ice"]
    invalid = []

    return cul(target, strong, weak, invalid)

# 地属性が攻撃
# 攻撃面　弱点１　耐性１　無効１　防御面　弱点３　耐性１　無効１
def Ground(target):
    strong = ["Electric"]
    weak = ["Ground"]
    invalid = ["Wind"]

    return cul(target, strong, weak, invalid)


# 属性倍率計算
def element_damage(target, attack):

    if attack == 'Normal':

        return Normal(target)

    elif attack == 'Fire':

        return Fire(target)

    elif attack == 'Water':

        return Water(target)

    elif attack == 'Electric':

        return Electric(target)

    elif attack == 'Leaf':

        return Leaf(target)

    elif attack == 'Wind':

        return Wind(target)

    elif attack == 'Ice':

        return Ice(target)

    elif attack == 'Ground':

        return Ground(target)