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
# 引数は経過時間と判定時間と定数ダメージ
def slip(target, index, health_disp):

    if target.alive == True:

        if target.effect[index].time > 0:
            
            # 第１引数はダメージを与えるスパン
            if target.effect[index].other_arg[0] > 0:

                # 与えるまでの時間を消費
                target.effect[index].other_arg[0] -= 1 / lm.fps

            else:

                # 第３引数はを与える定数ダメージ
                # 定数ダメージを与える
                target.left_HP -= target.effect[index].other_arg[2]

                # プレイヤーの場合
                if target.role == 'player':  
                    health_disp.append([-1 * int(target.effect[index].other_arg[2]), target.effect[index].other_arg[1], (264+target.cur_location[0]*(96+16)+random.randrange(96))*lm.resol[0]/1920, (552+target.cur_location[1]*(96+16))*lm.resol[1]/1080])

                # 第２引数は元の残り時間
                # 元の残り時間まで戻す
                target.effect[index].other_arg[0] = target.effect[index].other_arg[1]


# しもやけ
# １秒ごとに最大HPの３％のダメージを受ける
# 判定ごとに２０％の確率で解除
# 引数は経過時間
def frostbite(target, index, health_disp):

    if target.alive == True:

        if target.effect[index].time == True:

            # 炎属性ならしもやけにならない
            # 効果時間即終了
            if 'Fire' in target.element:
                target.effect[index].time = 0
            

            # 第１引数はダメージを与えるスパン
            if target.effect[index].other_arg[0] > 0:

                # 与えるまでの時間を消費
                target.effect[index].other_arg[0] -= 1 / lm.fps

            else:

                # 氷属性の場合は回復する
                if 'Ice' in target.element:
                    target.left_HP += target.HP * 3 / 100
                    if target.role == 'player':  
                        health_disp.append([int(target.HP * 3 / 100), 1, (264+target.cur_location[0]*(96+16)+random.randrange(96))*lm.resol[0]/1920, (552+target.cur_location[1]*(96+16))*lm.resol[1]/1080])
                # ３％の割合ダメージを与える
                else :
                    target.left_HP -= target.HP * 3 / 100
                    if target.role == 'player':  
                        health_disp.append([-1 * int(target.HP * 3 / 100), 1, (264+target.cur_location[0]*(96+16)+random.randrange(96))*lm.resol[0]/1920, (552+target.cur_location[1]*(96+16))*lm.resol[1]/1080])
            

                # 残り時間を１秒まで戻す
                target.effect[index].other_arg[0] = 1.0
                

                # ２０％の確率で解除
                if random.randrange(100) < 20:
                    
                    target.effect[index].time = False

        
# 凍結
# 移動、行動不可になる
# １秒ごとに解除の判定
# 判定ごとに２０％の確率で解除
# 引数は経過時間
def frozen(target, index):

    if target.effect[index].time == True:

        # 移動不可
        target.can_move = False

        # 行動不可
        target.can_action = False

        # 炎属性か氷属性なら凍結にならない
        # 効果時間即終了
        if 'Fire' in target.element or 'Ice' in target.element:
            target.effect[index].time = False
            target.can_move = True
            target.can_action = True
        

        # 第１引数は凍結解除までの判定時間
        if target.effect[index].other_arg[0] > 0:

            # 与えるまでの時間を消費
            target.effect[index].other_arg[0] -= 1 / lm.fps

        else:

            # 残り時間を１秒まで戻す
            target.effect[index].other_arg[0] = 1.0
            

            # ２０％の確率で解除
            if random.randrange(100) < 20:
                
                target.effect[index].time = False
                target.can_move = True
                target.can_action = True



# 炎上
# 0.25秒ごとに2ダメージを受ける
# 引数は経過時間
def on_fire(target, index, health_disp):

    if target.alive == True:

        if target.effect[index].time > 0:

            # 第１引数はダメージを与えるスパン
            if target.effect[index].other_arg[0] > 0:

                # 与えるまでの時間を消費
                target.effect[index].other_arg[0] -= 1 / lm.fps

            else:

                # 炎属性の場合は2回復
                if 'Fire' in target.element:
                    if target.left_HP < target.HP:
                        target.left_HP += 2
                        if target.left_HP > target.HP:
                            target.left_HP = target.HP
                        if target.role == 'player':  
                            health_disp.append([int(2), 0.25, (264+target.cur_location[0]*(96+16)+random.randrange(96))*lm.resol[0]/1920, (552+target.cur_location[1]*(96+16))*lm.resol[1]/1080])
                # 氷属性か草属性は4ダメージ
                elif 'Ice' in target.element or 'Leaf' in target.element :
                    target.left_HP -= 4
                    if target.role == 'player':  
                        health_disp.append([-1 * int(4), 0.25, (264+target.cur_location[0]*(96+16)+random.randrange(96))*lm.resol[0]/1920, (552+target.cur_location[1]*(96+16))*lm.resol[1]/1080])
                else:
                    target.left_HP -= 2
                    if target.role == 'player':  
                        health_disp.append([-1 * int(2), 0.25, (264+target.cur_location[0]*(96+16)+random.randrange(96))*lm.resol[0]/1920, (552+target.cur_location[1]*(96+16))*lm.resol[1]/1080])
            


                # 残り時間を0.25秒まで戻す
                target.effect[index].other_arg[0] = 0.25
            


# デバフ選択
def debuff_choice(player, enemy, target, index, health_disp, mana_disp):

    if target.effect[index].name == 'cant_move':
        cant_move(target, index)
    if target.effect[index].name == 'cant_action':
        cant_action(target, index)
    if target.effect[index].name == 'slip':
        slip(target, index, health_disp)
    if target.effect[index].name == 'frostbite':
        frostbite(target, index, health_disp)
    if target.effect[index].name == 'frozen':
        frozen(target, index)
    if target.effect[index].name == 'on_fire':
        on_fire(target, index, health_disp)
