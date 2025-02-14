import numpy as np
import math
import random
import pygame

import fonts
import colors
import lattitle_main as lm
import element

# 魔法効率の方程式
def effi_equ(player, consume_MP):
    
    a, b = effi_cul(player.Mgc.efficiency)

    #return (a * (100 * player.Mgc.left_MP / player.Mgc.MP) + b) / 100

    # 現在の魔力と消費後の魔力の平均を魔力効率の方程式に代入
    return (a * (100 * ((2 * player.Mgc.left_MP - consume_MP) / 2) / player.Mgc.MP) + b) / 100


# 魔法効率の方程式の定数を計算
def effi_cul(efficiency):

    A = np.array([[100, 1], [0, 1]])
    x = np.array([[efficiency], [100-efficiency]])

    a, b = np.linalg.inv(A) @ x

    return a, b

# MPの変動を表示
def disp_mana_fluct(mana_disp):
    mana_temp = []

    # MPの変動を表示
    for i in range(len(mana_disp)):
        # （ボスで表示サイズ変える？）
        #if enemy[0].category == "boss":

        # 正なら回復
        if mana_disp[i][0] > 0:
            lm.screen.blit(fonts.damage_font.render(str(mana_disp[i][0]), True, colors.BLUEVIOLET), [mana_disp[i][2], mana_disp[i][3]-10*(1-mana_disp[i][1])])
        # 負ならダメージ
        else:
            lm.screen.blit(fonts.damage_font.render(str(-1*mana_disp[i][0]), True, colors.BLUEVIOLET), [mana_disp[i][2], mana_disp[i][3]+10*(mana_disp[i][1])*math.sin(10*math.pi*(1-mana_disp[i][1]))])
        
        mana_disp[i][1] -= 1/lm.fps
        if mana_disp[i][1] <= 0:
            mana_temp.append(i)


    # 後ろから削除するために逆順にする（インデックスエラーを起こさないために）
    mana_temp.sort(reverse=True)

    # 一定時間経過したら表示は消える
    for i in mana_temp:
        mana_disp.pop(i)


# プレイヤーのまほう
def player_attack(player, enemy, select_player, press_button, health_disp):
    if player[select_player].command[press_button].category == "magic" and player[select_player].can_magic == True:

        resol = lm.resol

        # 消費魔力
        consume_MP = player[select_player].Mgc.left_MP * player[select_player].command[press_button].MP_percent / 100 + player[select_player].command[press_button].MP_const
        
        if player[select_player].Mgc.left_MP >= consume_MP:

            miss_count = 0

            for i in range(len(enemy)):

                if round(player[select_player].cur_location[0]) in enemy[i].hit_box:
                    
                    # 自分の残り「まりょく」と相手の残り「まりょく」
                    damage = [math.floor(22 * (player[select_player].Mgc.left_MP + 20) / (enemy[i].Mgc.left_MP + 20))]

                    # 魔法効率
                    damage[0] = math.floor(damage[0] * effi_equ(player[select_player], consume_MP))

                    # わざの威力
                    damage[0] = math.floor(damage[0] * player[select_player].command[press_button].power / 50 + 5)

                    # 属性の計算
                    # （弱点なら２倍　耐性なら０．５倍）
                    damage[0] = math.floor(damage[0] * element.element_damage(enemy[i].element, player[select_player].command[press_button].element))
                    # 属性一致
                    # （自分の属性とわざの属性が一致してたら１．５倍）
                    if player[select_player].command[press_button].element in player[select_player].element:
                        damage[0] = math.floor(damage[0] * 1.5)

                    # 0.85～1.0の乱数
                    damage[0] = math.floor(damage[0] * (random.randrange(85, 100+1) / 100))

                    # バフ補正

                    # デバフ補正

                    # 正負反転
                    damage[0] *= -1

                    enemy[i].left_HP += damage[0]

                    # 魔力消費
                    # 魔法消費割合を最大にかけるか残りにかけるか
                    player[select_player].Mgc.left_MP -= consume_MP
                
                else:
                    miss_count += 1

            # 全部ミスだったとき
            if miss_count == len(enemy):
                damage = ["miss"]

            player[select_player].action = 0
            damage.append(1)
            # 横軸をプレイヤーの攻撃位置に
            damage.extend([(264+player[select_player].cur_location[0]*(96+16)+random.randrange(96))*resol[0]/1920, (40+32+random.randrange(384-32))*resol[1]/1080])
            health_disp.append(damage)
            

# 敵のまほう
def enemy_attack(player, enemy, index, health_disp):
    
    for i in range(len(player)):

        if player[i].alive == True:

            # プレイヤーが攻撃範囲内に半分以上重なってたら？（あとで少しでもかすってたらにする？）
            if round(player[i].cur_location[0]) == enemy.attack[index].x and round(player[i].cur_location[1]) == enemy.attack[index].y:
                
                # （ダメージ計算式は後で考える）

                # 敵の残り「まりょく」とプレイヤーの残り「まりょく」
                damage = [math.floor(22 * (enemy.Mgc.left_MP + 20) / (player[i].Mgc.left_MP + 20))]

                # 魔法効率
                #damage[0] = math.floor(damage[0] * effi_equ(enemy, ))

                # 属性ぼうぎょ補正？？
                #if player[i].Def.valid == True:
                #    damage[0] = math.floor(damage[0] * (100 - player[i].Def.reduce_percent) / 100 - player[i].Def.reduce_const)

                # わざの威力
                damage[0] = math.floor(damage[0] * enemy.attack[index].power / 50 + 5)
                
                # 属性の計算
                damage[0] = math.floor(damage[0] * element.element_damage(player[i].element, enemy.attack[index].element))

                # 属性一致
                if enemy.attack[index].element in enemy.element:
                    damage[0] = math.floor(damage[0] * 1.5)

                # 0.85～1.0の乱数
                damage[0] = math.floor(damage[0] * (random.randrange(85, 100+1) / 100))

                # バフ補正

                # デバフ補正

                # 正負反転
                damage[0] *= -1

                player[i].left_HP += damage[0]


                # 攻撃の追加効果
                for j in range(len(enemy.attack[index].effect)):
                    
                    enemy.attack[index].effect[j].image = pygame.image.load("./data_list/images/effects/" + enemy.attack[index].effect[j].name + ".png")
                    #print(vars(enemy.attack[index].effect[j]))
                    player[i].effect.append(enemy.attack[index].effect[j])

                damage.append(1)
                # 横軸をプレイヤーの位置に
                damage.extend([(264+player[i].cur_location[0]*(96+16)+random.randrange(96))*lm.resol[0]/1920, (552+player[i].cur_location[1]*(96+16))*lm.resol[1]/1080])
                health_disp.append(damage)
