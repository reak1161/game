import random
import classes


# デトネーション
# 威力 150 予備動作時間 5秒 クールダウン 5秒
# 十字型の爆発を起こす
def detonation(enemy):

    # 魔力消費 50
    consume_MP = 50

    if enemy.Mgc.left_MP >= consume_MP:

        # 攻撃する場所
        scope_x = random.randrange(4)
        scope_y = random.randrange(4)

        # 攻撃
        point = [['magic', 'デトネーション', 150, 'Fire', scope_x, scope_y, 5, 0, None]]

        # 横方向（端じゃなければ）
        if scope_x > 0:
            point.append(['magic', 'デトネーション', 150, 'Fire', scope_x-1, scope_y, 5, 0, None])
        if scope_x < 3:
            point.append(['magic', 'デトネーション', 150, 'Fire', scope_x+1, scope_y, 5, 0, None])

        # 縦方向（端じゃなければ）
        if scope_y > 0:
            point.append(['magic', 'デトネーション', 150, 'Fire', scope_x, scope_y-1, 5, 0, None])
        if scope_y < 3:
            point.append(['magic', 'デトネーション', 150, 'Fire', scope_x, scope_y+1, 5, 0, None])

        # 型変換
        classes.Enemy_attack.trans_all(point)
        
        # 攻撃キューに連結
        enemy.attack.extend(point)

        # クールダウン５秒
        enemy.cool_down += 5.0

        # 魔力消費
        enemy.Mgc.left_MP -= consume_MP

        # 行動ゲージリセット
        enemy.action = 0


# ヘルフレイム
# 威力 100 予備動作時間 3秒 クールダウン 3秒
# 縦一列に攻撃
def hell_flame(enemy):

    # 魔力消費 50
    consume_MP = 50

    if enemy.Mgc.left_MP >= consume_MP:

        # 攻撃する列
        scope = random.randrange(2)

        # 攻撃
        point = [['magic', 'ヘルフレイム', 100, 'Fire', scope+2, 0, 3, 0, None, ['debuff', 'on_fire', 10, 0.25]],
                 ['magic', 'ヘルフレイム', 100, 'Fire', scope+2, 1, 3, 0, None, ['debuff', 'on_fire', 10, 0.25]],
                 ['magic', 'ヘルフレイム', 100, 'Fire', scope+2, 2, 3, 0, None, ['debuff', 'on_fire', 10, 0.25]],
                 ['magic', 'ヘルフレイム', 100, 'Fire', scope+2, 3, 3, 0, None, ['debuff', 'on_fire', 10, 0.25]]]

        # 型変換
        classes.Enemy_attack.trans_all(point)
        
        # 攻撃キューに連結
        enemy.attack.extend(point)

        # クールダウン３秒
        enemy.cool_down += 3.0

        # 魔力消費
        enemy.Mgc.left_MP -= consume_MP

        # 行動ゲージリセット
        enemy.action = 0


# だいふんか
# 威力 200 予備動作時間 5秒 クールダウン 5秒
# 2*2の範囲に噴火を起こす
def eruption(enemy):

    # 魔力消費 50
    consume_MP = 50

    if enemy.Mgc.left_MP >= consume_MP:

        # 攻撃する場所
        scope_x = random.randrange(3)
        scope_y = random.randrange(3)


        # 攻撃
        point = [['magic', 'だいふんか', 200, 'Fire', scope_x, scope_y, 5, 0, None],
                 ['magic', 'だいふんか', 200, 'Fire', scope_x+1, scope_y, 5, 0, None],
                 ['magic', 'だいふんか', 200, 'Fire', scope_x, scope_y+1, 5, 0, None],
                 ['magic', 'だいふんか', 200, 'Fire', scope_x+1, scope_y+1, 5, 0, None]]

        # 型変換
        classes.Enemy_attack.trans_all(point)
        
        # 攻撃キューに連結
        enemy.attack.extend(point)

        # クールダウン５秒
        enemy.cool_down += 5.0

        # 魔力消費
        enemy.Mgc.left_MP -= consume_MP

        # 行動ゲージリセット
        enemy.action = 0



# こうどうを選ぶ
# 敵リストと行動中の敵インデックスを引数に？
def action_choice(enemy, index):

    # こうどうをランダムに選ぶ
    name = random.choices(enemy[index].actions, k = 1, weights = enemy[index].weight)[0]

    if name == 'detonation':

        detonation(enemy[index])

    elif name == 'hell_flame':

        hell_flame(enemy[index])

    elif name == 'eruption':

        eruption(enemy[index])