import random
import classes

# ヘイルプリズム
# 威力 80 予備動作時間 3秒 クールダウン 3秒
# ランダムに４か所を攻撃
# 命中したプレイヤーにしもやけを付与
def hail_prism(enemy):

    # 攻撃する場所
    scope = random.sample(range(0,16), 4)

    # 攻撃
    point = [['attack', 'ヘイルプリズム', 80, 'Ice', scope[0]%4, scope[0]/4, 3, 0, None, ['debuff', 'frostbite', True, 1]],
             ['attack', 'ヘイルプリズム', 80, 'Ice', scope[1]%4, scope[1]/4, 3, 0, None, ['debuff', 'frostbite', True, 1]],
             ['attack', 'ヘイルプリズム', 80, 'Ice', scope[2]%4, scope[2]/4, 3, 0, None, ['debuff', 'frostbite', True, 1]],
             ['attack', 'ヘイルプリズム', 80, 'Ice', scope[3]%4, scope[3]/4, 3, 0, None, ['debuff', 'frostbite', True, 1]]]

    # 型変換
    classes.Enemy_attack.trans_all(point)
    
    # 攻撃キューに連結
    enemy.attack.extend(point)

    # クールダウン３秒
    enemy.cool_down += 3.0

    # 行動ゲージリセット
    enemy.action = 0


# アイスソード
# 威力 75*2 予備動作時間 3秒 クールダウン 5秒
# 縦横斜めの１列攻撃を２回
# 命中したプレイヤーにしもやけを付与
def ice_sword(enemy):

    point = []

    # ２回攻撃
    for i in range(2):

        # 攻撃する列
        lane = random.randrange(10)

        # 縦方向の攻撃
        if 0 <= lane <= 3:
            attack = [['attack', 'アイスソード', 75, 'Ice', lane, 0, 3+i, i, 'ice_sword.mp3', ['debuff', 'frostbite', True, 1]],
                      ['attack', 'アイスソード', 75, 'Ice', lane, 1, 3+i, i, None, ['debuff', 'frostbite', True, 1]],
                      ['attack', 'アイスソード', 75, 'Ice', lane, 2, 3+i, i, None, ['debuff', 'frostbite', True, 1]],
                      ['attack', 'アイスソード', 75, 'Ice', lane, 3, 3+i, i, None, ['debuff', 'frostbite', True, 1]]]
        # 横方向の攻撃
        elif 4 <= lane <= 7:
            attack = [['attack', 'アイスソード', 75, 'Ice', 0, lane-4, 3+i, i, 'ice_sword.mp3', ['debuff', 'frostbite', True, 1]],
                      ['attack', 'アイスソード', 75, 'Ice', 1, lane-4, 3+i, i, None, ['debuff', 'frostbite', True, 1]],
                      ['attack', 'アイスソード', 75, 'Ice', 2, lane-4, 3+i, i, None, ['debuff', 'frostbite', True, 1]],
                      ['attack', 'アイスソード', 75, 'Ice', 3, lane-4, 3+i, i, None, ['debuff', 'frostbite', True, 1]]]
        # 左上から右下の攻撃
        elif lane == 8:
            attack = [['attack', 'アイスソード', 75, 'Ice', 0, 0, 3+i, i, 'ice_sword.mp3', ['debuff', 'frostbite', True, 1]],
                      ['attack', 'アイスソード', 75, 'Ice', 1, 1, 3+i, i, None, ['debuff', 'frostbite', True, 1]],
                      ['attack', 'アイスソード', 75, 'Ice', 2, 2, 3+i, i, None, ['debuff', 'frostbite', True, 1]],
                      ['attack', 'アイスソード', 75, 'Ice', 3, 3, 3+i, i, None, ['debuff', 'frostbite', True, 1]]]
        # 右上から左下の攻撃
        elif lane == 9:
            attack = [['attack', 'アイスソード', 75, 'Ice', 3, 0, 3+i, i, 'ice_sword.mp3', ['debuff', 'frostbite', True, 1]],
                      ['attack', 'アイスソード', 75, 'Ice', 2, 1, 3+i, i, None, ['debuff', 'frostbite', True, 1]],
                      ['attack', 'アイスソード', 75, 'Ice', 1, 2, 3+i, i, None, ['debuff', 'frostbite', True, 1]],
                      ['attack', 'アイスソード', 75, 'Ice', 0, 3, 3+i, i, None, ['debuff', 'frostbite', True, 1]]]

        point.extend(attack)

    # 型変換
    classes.Enemy_attack.trans_all(point)
    
    # 攻撃キューに連結
    enemy.attack.extend(point)

    # クールダウン５秒
    enemy.cool_down += 5.0

    # 行動ゲージリセット
    enemy.action = 0


# ゆきなだれ
# 威力 120 予備動作時間 5秒 クールダウン 5秒
# 左側２列を攻撃
# 命中したプレイヤーにしもやけと凍結を付与
def avalanche(enemy):

    # 攻撃
    point = [['attack', 'ゆきなだれ', 120, 'Ice', 0, 0, 5, 0, None, ['debuff', 'frostbite', True, 1], ['debuff', 'frozen', True, 1]],
             ['attack', 'ゆきなだれ', 120, 'Ice', 0, 1, 5, 0, None, ['debuff', 'frostbite', True, 1], ['debuff', 'frozen', True, 1]],
             ['attack', 'ゆきなだれ', 120, 'Ice', 0, 2, 5, 0, None, ['debuff', 'frostbite', True, 1], ['debuff', 'frozen', True, 1]],
             ['attack', 'ゆきなだれ', 120, 'Ice', 0, 3, 5, 0, None, ['debuff', 'frostbite', True, 1], ['debuff', 'frozen', True, 1]],
             ['attack', 'ゆきなだれ', 120, 'Ice', 1, 0, 5, 0, None, ['debuff', 'frostbite', True, 1], ['debuff', 'frozen', True, 1]],
             ['attack', 'ゆきなだれ', 120, 'Ice', 1, 1, 5, 0, None, ['debuff', 'frostbite', True, 1], ['debuff', 'frozen', True, 1]],
             ['attack', 'ゆきなだれ', 120, 'Ice', 1, 2, 5, 0, None, ['debuff', 'frostbite', True, 1], ['debuff', 'frozen', True, 1]],
             ['attack', 'ゆきなだれ', 120, 'Ice', 1, 3, 5, 0, None, ['debuff', 'frostbite', True, 1], ['debuff', 'frozen', True, 1]]]

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

    if name == 'hail_prism':

        hail_prism(enemy[index])

    elif name == 'ice_sword':

        ice_sword(enemy[index])

    elif name == 'avalanche':

        avalanche(enemy[index])