import random
import classes

# 予備動作時間にわざ名を表示したい


# しっぽうち
# 威力 150 予備動作時間 5秒 クールダウン 5秒
# 縦一列に攻撃
def tail_rush(enemy):

    # 攻撃する横の列
    scope = random.randrange(4)

    # 攻撃
    point = [['attack', 'しっぽうち', 150, 'Normal', scope, 0, 5, 0, None],
             ['attack', 'しっぽうち', 150, 'Normal', scope, 1, 5, 0, None],
             ['attack', 'しっぽうち', 150, 'Normal', scope, 2, 5, 0, None],
             ['attack', 'しっぽうち', 150, 'Normal', scope, 3, 5, 0, None]]

    # 型変換
    classes.Enemy_attack.trans_all(point)
    
    # 攻撃キューに連結
    enemy.attack.extend(point)

    # クールダウン５秒
    enemy.cool_down += 5.0

    # 行動ゲージリセット
    enemy.action = 0


# へびダッシュ
# 威力 75 予備動作時間 5秒 クールダウン 5秒 
# 盤面を縦横無尽にかけまわる
def snake_dash(enemy):

    # 攻撃
    point = []

    # ジグザグに攻撃
    for i in range(4):
        
        # 偶数行は順方向
        if i % 2 == 0:
            for j in range(4):
                point.append(['attack', 'へびダッシュ', 75, 'Normal', j, i, 5+j*0.05+i*0.20, j*0.05+i*0.20, None])
        # 奇数行は逆方向
        else:
            for j in range(4-1, -1, -1):
                point.append(['attack', 'へびダッシュ', 75, 'Normal', j, i, 5+(3-j)*0.05+i*0.20, (3-j)*0.05+i*0.20, None])

    # 型変換
    classes.Enemy_attack.trans_all(point)
    
    # 攻撃キューに連結
    enemy.attack.extend(point)

    # クールダウン５秒
    enemy.cool_down += 5.0

    # 行動ゲージリセット
    enemy.action = 0


# しめつけ
# 威力 50 予備動作時間 5秒 クールダウン 5秒
# 命中したプレイヤーをしっぽで拘束する
# 命中したプレイヤーは数秒間移動も行動もできず、スリップダメージを受ける
def tightening(enemy):
    
    # 攻撃する位置
    scope_x = random.randrange(4)
    scope_y = random.randrange(4)

    # 移動不可 10秒
    # 行動不可 10秒
    # スリップ？ 10秒

    # 攻撃
    # バフデバフはリストで末尾につける？
    # 攻撃は２次元配列で与える
    point = [['attack', 'しめつけ', 50, 'Normal', scope_x, scope_y, 5, 0, None, ['debuff', 'cant_move', 10], ['debuff', 'cant_action', 10], ['debuff', 'slip', 10, 1, 1, 10]]]
    
    
    # 型変換
    classes.Enemy_attack.trans_all(point)
    
    # 攻撃キューに連結
    enemy.attack.extend(point)

    # クールダウン５秒
    enemy.cool_down += 5.0

    # 行動ゲージリセット
    enemy.action = 0


# こうどうを選ぶ
# 敵リストと行動中の敵インデックスを引数に？
def action_choice(enemy, index):

    # こうどうをランダムに選ぶ
    name = random.choices(enemy[index].actions, k = 1, weights = enemy[index].weight)[0]

    if name == 'tail_rush':

        tail_rush(enemy[index])

    elif name == 'snake_dash':

        snake_dash(enemy[index])

    elif name == 'tightening':

        tightening(enemy[index])