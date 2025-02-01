class Mouse:
    def __init__(self, list):
        self.x = list[0]
        self.y = list[1]

    def update(self, list):
        self.x = list[0]
        self.y = list[1]

class Cursor:
    def __init__(self):
        self.x = 0
        self.y = 0

class Player:

    # プレイヤー
    role = 'player'

    # 生存しているか
    alive = True

    # 現在地
    cur_location = [0.0, 0.0]

    # 移動経路
    route = []

    # 目的地
    destination = [0, 0]

    # ぼうぎょ （軽減率, 軽減数, 防御時移動補正）
    defense = [False, 0, 0, 100]

    # 現在の行動ゲージ
    action = 0.0

    # 動けるか
    can_move = True

    # 行動できるか
    can_action = True

    # 攻撃できるか
    can_attack = True

    # 防御できるか
    can_defense = True

    # 魔法が使えるか
    can_magic = True

    # アイテムが使えるか
    can_item = True

    # プレイヤーカラー
    color = (0, 0, 0)

    # プレイヤー画像
    image = None
    

    # ステータス初期化
    def __init__(self, list):
        self.name = str(list[0][0])
        self.No = str(list[0][1])
        self.img = str(list[1][0])
        self.HP = int(list[2][0])
        self.Atk = int(list[3][0])
        self.Def = Defense(list[4])
        self.Mgc = Magic(list[5])
        self.Spd = int(list[6][0])
        self.Itg = int(list[7][0])
        self.Itg_Spd = float(list[7][1])

        # バフ，デバフ用の配列？を作る。
        

        # 残りHP
        self.left_HP = self.HP

        # 表示用HP
        self.disp_HP = self.HP

        # 属性
        self.element = [str(s) for s in list[8]]

        # コマンド
        self.command = []

        # 数値はintで格納
        for i in range(4):
            if list[9+i][0] == "attack":
                self.command.append(Command_attack(list[9+i]))
            if list[9+i][0] == "defense":
                self.command.append(Command_defense(list[9+i]))
            if list[9+i][0] == "magic":
                self.command.append(Command_magic(list[9+i]))
            if list[9+i][0] == "skill":
                self.command.append()
            if list[9+i][0] == "item":
                self.command.append(Command_item(list[9+i]))
        
        # 状態異常
        self.effect = []


class Defense:
    
    def __init__(self, list):
        
        self.defense = int(list[0])
        
        self.valid = False

        self.reduce_percent = 0.0
        self.reduce_const = 0.0
        self.speed = 100
        self.element_percent = 0.0
        self.element_const = 0.0
        

class Magic:
    def __init__(self, list):
        self.MP = int(list[0])
        self.recover = int(list[1])
        self.efficiency = int(list[2])

         # 残り魔力
        self.left_MP = self.MP

class Command_attack:
    def __init__(self, list):
        self.category = str(list[0])
        self.name = str(list[1])
        self.power = int(list[2])
        self.frequency = int(list[3])
        self.charge_time = float(list[4])
        self.range = str(list[5])
        self.element = str(list[6])

class Command_defense:
    def __init__(self, list):
        self.category = str(list[0])
        self.name = str(list[1])
        self.reduce_percent = float(list[2])
        self.reduce_const = float(list[3])
        self.speed = float(list[4])
        self.element_percent = float(list[5])
        self.element_const = float(list[6])

class Command_magic:
    def __init__(self, list):
        self.category = str(list[0])
        self.name = str(list[1])
        self.power = int(list[2])
        self.MP_percent = float(list[3])
        self.MP_const = float(list[4])
        self.charge_time = int(list[5])
        self.range = str(list[6])
        self.element = str(list[7])

class Command_item:
    def __init__(self, list):
        self.category = str(list[0])


class Buff_Debuff:

    def __init__(self, list):

        # 分類
        self.category = str(list[0])

        # 名前
        self.name = str(list[1])
        
        # 効果時間
        if type(list[2]) == int:
            self.time = float(list[2])
        # 制限時間がない場合
        else :
            self.time = list[2]
        
        # その他引数
        self.other_arg = [float(s) for s in list[3:]]
        

class Enemy:

    # 敵
    role = 'enemy'

    # 生存しているか
    alive = True

    # 画像
    image = None

    # 攻撃のキュー
    attack = []

    # 現在の行動ゲージ
    action = 0.0

    # こうどうファイル
    action_path = None

    # 行動後クールダウン
    cool_down = 0

    # ステータス初期化
    def __init__(self, list):
        self.name = str(list[0][0])
        self.No = str(list[0][1])
        self.img = str(list[1][0])
        self.HP = int(list[2][0])
        self.Atk = int(list[3][0])
        self.Def = Defense(list[4])
        self.Mgc = Magic(list[5])
        self.Itg = int(list[6][0])
        
        # 分類
        self.category = str(list[7][0])
        # 前後
        self.guard = str(list[7][1])

        self.hit_box = [int(h) for h in list[8]]

        # 残りHP
        self.left_HP = self.HP

        # 表示用HP
        self.disp_HP = self.HP

        # 属性
        self.element = [str(s) for s in list[9]]

        # パッシブ
        self.passive = [Enemy_passive(s) for s in list[10]]
            
        # こうどう
        self.actions = []

        # 重み
        self.weight = []
        for i in range(int(list[11][0])):
            self.actions.append(str(list[12+i][0]))
            self.weight.append(float(list[12+i][1]))


class Enemy_passive:

    def __init__(self, string):

        self.name = str(string)
        self.valid = True

class Enemy_attack:
    def __init__(self, list):

        # 分類
        self.category = str(list[0])

        # 名前
        self.name = str(list[1])
        
        # 威力
        self.power = int(list[2])
        
        # 属性
        self.element = str(list[3])
        
        # 座標
        self.x = int(list[4])
        self.y = int(list[5])
        
        # 予備動作時間
        self.preliminary = float(list[6])
        
        # 表示まで
        self.until_disp = float(list[7])

        # 追加効果のリスト
        self.effect = []

        # 追加効果のリスト
        for i in range(8, len(list)):
            self.effect.append(Buff_Debuff(list[i]))
            

    # 一括変換
    def trans_all(lists):
    
        for i in range(len(lists)):
            lists[i] = Enemy_attack(lists[i])