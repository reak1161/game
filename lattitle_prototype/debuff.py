import lattitle_main as lm
import random


# 移動不可
def cant_move(target, index):

    if target.effect[index].time > 0:
        
        # 移動不可
        target.can_move = False

    # 効果解除
    else:
        target.can_move = True
    

# 行動不可
def cant_action(target, index):

    if target.effect[index].time > 0:
        
        # 行動不可
        target.can_action = False

    # 効果解除
    else:
        target.can_action = True


# スリップダメージ 
# 判定ごとにダメージを受ける
# 引数は時間と経過時間と定数ダメージ
def slip(target, index, health_disp):

    if target.effect[index].time > 0:
        
        # ダメージを与えるスパン
        if target.effect[index].other_arg[0] > 0:

            # 与えるまでの時間を消費
            target.effect[index].other_arg[0] -= 1 / lm.fps

        else:

            # 定数ダメージを与える
            target.left_HP -= target.effect[index].other_arg[2]

            # プレイヤーの場合
            if target.role == 'player':  
                health_disp.append([-1 * int(target.effect[index].other_arg[2]), 1, (264+target.cur_location[0]*(96+16)+random.randrange(96))*lm.resol[0]/1920, (552+target.cur_location[1]*(96+16))*lm.resol[1]/1080])

            # 元の残り時間まで戻す
            target.effect[index].other_arg[0] = target.effect[index].other_arg[1]


# しもやけ
# 判定ごとに確率で解除
# 定数ダメージ？を受ける
# 引数は
def frostbite(target, index, health_disp):

    if target.effect[index].time > 0:
        
        # ダメージを与えるスパン
        if target.effect[index].other_arg[0] > 0:

            # 与えるまでの時間を消費
            target.effect[index].other_arg[0] -= 1 / lm.fps

        else:

            # 定数ダメージを与える
            target.left_HP -= target.effect[index].other_arg[2]

            # プレイヤーの場合
            if target.role == 'player':  
                health_disp.append([-1 * int(target.effect[index].other_arg[2]), 1, (264+target.cur_location[0]*(96+16)+random.randrange(96))*lm.resol[0]/1920, (552+target.cur_location[1]*(96+16))*lm.resol[1]/1080])

            # 元の残り時間まで戻す
            target.effect[index].other_arg[0] = target.effect[index].other_arg[1]

        
# 凍結
# 判定ごとに確率で解除
# 移動ができなくなる
# 引数は        



# デバフ選択
def debuff_choice(player, enemy, target, index, health_disp, mana_disp):

    if target.effect[index].name == 'cant_move':
        cant_move(target, index)
    if target.effect[index].name == 'cant_action':
        cant_action(target, index)
    if target.effect[index].name == 'slip':
        slip(target, index, health_disp)