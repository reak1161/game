import random
import math
import pygame

import fonts
import colors
import lattitle_main as lm
import element

# 位置によるダメージの調整
# 最前列なら２倍、最後列なら０．５倍
def player_guard_adjustment(point):
    return 2 * (1/2) ** (point/1.5)

def enemy_guard_adjustment(point):
    # 最前列：１．５倍
    if point == "front":
        return 3/2
    # 中列：１倍
    if point == "middle":
        return 1
    # 最後列：０．６６倍
    if point == "back":
        return 2/3

### インデックスをドットに変える！！！ 　例：[0] -> .category

# HPの変動を表示
def disp_health_fluct(health_disp):
    health_temp = []

    # HPの変動を表示
    for i in range(len(health_disp)):
        # （ボスで表示サイズ変える？）
        #if enemy[0].category == "boss":

        if type(health_disp[i][0]) is str:

            lm.screen.blit(fonts.damage_font.render(str(health_disp[i][0]), True, colors.RED), [health_disp[i][2], health_disp[i][3]+10*(health_disp[i][1])*math.sin(10*math.pi*(1-health_disp[i][1]))])

        else:
            # 正なら回復
            if health_disp[i][0] > 0:
                lm.screen.blit(fonts.damage_font.render(str(health_disp[i][0]), True, colors.GREEN), [health_disp[i][2], health_disp[i][3]-10*(1-health_disp[i][1])])
            # 負ならダメージ
            else:
                lm.screen.blit(fonts.damage_font.render(str(-1*health_disp[i][0]), True, colors.RED), [health_disp[i][2], health_disp[i][3]+10*(health_disp[i][1])*math.sin(10*math.pi*(1-health_disp[i][1]))])
        
        health_disp[i][1] -= 1/lm.fps
        if health_disp[i][1] <= 0:
            health_temp.append(i)


    # 後ろから削除するために逆順にする（インデックスエラーを起こさないために）
    health_temp.sort(reverse=True)

    # 一定時間経過したら表示は消える
    for i in health_temp:
        health_disp.pop(i)  

# 攻撃関数
def player_attack(player, enemy, select_player, press_button, health_disp):

    #if (player[select_player].command[press_button].category == "attack" and player[select_player].can_attack == True) or player[select_player].command[press_button].charging == True:
    if player[select_player].command[press_button].category == "attack" and player[select_player].can_attack == True:
    
        # チャージ時間を設定
        if player[select_player].command[press_button].charge_time > 0 and player[select_player].charging == False:

            # チャージ中を有効
            player[select_player].charging = True

            # チャージ時間を設定
            player[select_player].left_time = player[select_player].command[press_button].charge_time

            # チャージ中のコマンド
            player[select_player].charge_command = press_button

        
        # 残りチャージ時間が０
        if player[select_player].left_time <= 0:

            resol = lm.resol
        
            miss_count = 0

            for i in range(len(enemy)):

                if round(player[select_player].cur_location[0]) in enemy[i].hit_box:
                    
                    # 自分の「こうげき」と相手の「ぼうぎょ」
                    damage = [math.floor(22 * (player[select_player].Atk + 20) / (enemy[i].Def.defense + 20))]

                    # わざの威力
                    damage[0] = math.floor(damage[0] * player[select_player].command[press_button].power / 50 + 5)

                    # 属性の計算
                    # （弱点なら２倍　耐性なら０．５倍）
                    damage[0] = math.floor(damage[0] * element.element_damage(enemy[i].element, player[select_player].command[press_button].element))

                    # 属性一致
                    # （自分の属性とわざの属性が一致してたら１．５倍）
                    if player[select_player].command[press_button].element in player[select_player].element:
                        damage[0] = math.floor(damage[0] * 1.5)

                    # プレイヤーの位置
                    damage[0] = math.floor(damage[0] * player_guard_adjustment(player[select_player].cur_location[1]))
                    # 敵の位置
                    damage[0] = math.floor(damage[0] * enemy_guard_adjustment(enemy[i].guard))

                    # 0.85～1.0の乱数
                    damage[0] = math.floor(damage[0] * (random.randrange(85, 100+1) / 100))

                    # バフ補正

                    # デバフ補正

                    # 正負反転
                    damage[0] *= -1

                    enemy[i].left_HP += damage[0]
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

            # チャージ中を解除
            player[select_player].charging = False


# 敵の攻撃
def enemy_attack(player, enemy, index, health_disp):
    
    for i in range(len(player)):

        if player[i].alive == True:

            # プレイヤーが攻撃範囲内に半分以上重なってたら？（あとで少しでもかすってたらにする？）
            if round(player[i].cur_location[0]) == enemy.attack[index].x and round(player[i].cur_location[1]) == enemy.attack[index].y:
                
                # （ダメージ計算式は後で考える）

                # 敵の「こうげき」とプレイヤーの「ぼうぎょ」
                damage = [math.floor(22 * (enemy.Atk + 20) / (player[i].Def.defense + 20))]

                # ぼうぎょ補正
                if player[i].Def.valid == True:
                    damage[0] = math.floor(damage[0] * (100 - player[i].Def.reduce_percent) / 100 - player[i].Def.reduce_const)

                
                # 属性防御補正？？？


                # わざの威力
                damage[0] = math.floor(damage[0] * enemy.attack[index].power / 50 + 5)

                # 属性の計算
                damage[0] = math.floor(damage[0] * element.element_damage(player[i].element, enemy.attack[index].element))

                # 属性一致
                if enemy.attack[index].element in enemy.element:
                    damage[0] = math.floor(damage[0] * 1.5)

                # プレイヤーの位置 
                damage[0] = math.floor(damage[0] * player_guard_adjustment(player[i].cur_location[1]))
                # 敵の位置
                damage[0] = math.floor(damage[0] * enemy_guard_adjustment(enemy.guard))

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

                # 音（ならないから修正）
                # mutagenやplaysoundが使えない？
                """
                if enemy.attack[index].play_sound != 'None':

                    filename = './data_list/enemies/' + enemy.No + '/sounds/' + enemy.attack[index].play_sound #再生したいmp3ファイル
                    pygame.mixer.init()
                    pygame.mixer.music.load(filename) #音源を読み込み
                    #mp3_length = mp3(filename).info.length #音源の長さ取得
                    pygame.mixer.music.play(1) #再生開始。1の部分を変えるとn回再生(その場合は次の行の秒数も×nすること)
                    #time.sleep(mp3_length + 0.25) #再生開始後、音源の長さだけ待つ(0.25待つのは誤差解消)
                    #pygame.mixer.music.stop() #音源の長さ待ったら再生停止
                """

                damage.append(1)
                # 横軸をプレイヤーの位置に
                damage.extend([(264+player[i].cur_location[0]*(96+16)+random.randrange(96))*lm.resol[0]/1920, (552+player[i].cur_location[1]*(96+16))*lm.resol[1]/1080])
                health_disp.append(damage)
