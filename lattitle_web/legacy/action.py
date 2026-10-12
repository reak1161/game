import lattitle_main as lm
import pygame
import math
import random

import attack
import defense
import magic

import players
import enemies

import images
import fonts
import colors

import items

# 行動ゲージがたまるまでにかかるフレーム
def action_time(itg):
    return lm.fps * 20 * (1/2) ** (itg/100)

# プレイヤー行動ゲージチャージ
def player_action_chaege(player):

    for i in range(len(player)):

        # 行動ゲージがたまってない　かつ　生存中
        if player[i].action < 1000 and player[i].alive == True:

            # 移動中は溜まりにくい
            if len(player[i].route) >= 2:
                player[i].action += (1000 * (player[i].Itg_Spd / 100) / action_time(player[i].Itg))
            else:
                player[i].action += (1000 / action_time(player[i].Itg))
        else:
            # 防御が終了
            defense.defense_reset(player, i)


# 敵行動ゲージチャージ
def enemy_action_charge(enemy):

    for i in range(len(enemy)):

        # 行動ゲージがたまっていない
        if enemy[i].action < 1000:

            # 行動後一定時間経過している
            if enemy[i].cool_down > 0:
            
                # 行動後は行動ゲージが溜まるのが遅い
                enemy[i].action += (1000 / action_time(enemy[i].Itg)) / 10

                # クールダウン消化
                enemy[i].cool_down -= 1/lm.fps

            else:
                enemy[i].action += (1000 / action_time(enemy[i].Itg))


# プレイヤーのこうどう 
def player_action(player, enemy, item, select_player, press_button, picked_item, health_disp, mana_disp):

    #行動ゲージが1000を超えたら行動可能　かつ　ボタンを押している　かつ　行動可能　かつ　プレイヤーを選択中　かつ　チャージ中でない
    #if (player[select_player].action >= 1000 and press_button != -1 and player[select_player].can_action == True and select_player != -1) or player[select_player].command[press_button].charging == True:
    if player[select_player].action >= 1000 and press_button != -1 and player[select_player].can_action == True and select_player != -1 and player[select_player].charging == False:

        # こうげき
        attack.player_attack(player, enemy, select_player, press_button, health_disp)
            
        # ぼうぎょ
        defense.player_defense(player, select_player, press_button)

        # まほう
        magic.player_attack(player, enemy, select_player, press_button, health_disp)

        # スキル
        # （まほうの自分にかけるバージョンみたいな？差別化）


        # アイテム
        if picked_item != -1: # アイテムを決定中
            items.use(item[picked_item], player, enemy, select_player, press_button, health_disp, mana_disp)


    # チャージ中の処理
    player_charge(player, enemy, health_disp)


# チャージ中の処理
def player_charge(player, enemy, health_disp):

    for i in range(len(player)):

        # チャージ中の行動を消化
        if player[i].charging == True and player[i].action >= 1000:

            #print("charging", player[i].left_time)

            # 残りチャージ時間を減少
            if player[i].left_time > 0:

                player[i].left_time -= 1/lm.fps

            else:

                # こうげき
                attack.player_attack(player, enemy, i, player[i].charge_command, health_disp)

                # まほう
                magic.player_attack(player, enemy, i, player[i].charge_command, health_disp)


# 敵のこうどう
def enemy_action(player, enemy, health_disp):

    for i in range(len(enemy)):

        # 敵の攻撃
        if enemy[i].action >= 1000 and enemy[i].alive == True:
            
            # こうどうを選ぶ
            enemy[i].action_path.action_choice(enemy, i)


        # 削除するやつを一時的に保持
        pop_temp = []

        # 攻撃のキューを消化
        for j in range(len(enemy[i].attack)):

            
            # 表示までの時間を消化
            if enemy[i].attack[j].until_disp > 0:
                enemy[i].attack[j].until_disp -= 1/lm.fps

            else:
                
                # 技名を表示
                # 後で修正
                if enemy[i].category == "boss":
                    img_temp = pygame.transform.scale(images.img_enemy_thought_right, [(36+24*len(enemy[i].attack[j].name))*lm.resol[0]/1920, 64*lm.resol[1]/1080]).get_rect()
                    img_temp.topleft = [700*lm.resol[0]/1920, 104*lm.resol[1]/1080]
                    lm.screen.blit(pygame.transform.scale(images.img_enemy_thought_right, [(36+24*len(enemy[i].attack[j].name))*lm.resol[0]/1920, 64*lm.resol[1]/1080]), img_temp)

                    action_txt = fonts.action_font.render(enemy[i].attack[j].name, True, colors.BLACK)
                    action_place = action_txt.get_rect(center=((700+(36+24*len(enemy[i].attack[j].name))/2)*lm.resol[0]/1920, (118+12)*lm.resol[1]/1080))
                    lm.screen.blit(action_txt, action_place)
                
                if enemy[i].category == "left":
                    img_temp = pygame.transform.scale(images.img_enemy_thought, [(36+24*len(enemy[i].attack[j].name))*lm.resol[0]/1920, 64*lm.resol[1]/1080]).get_rect()
                    img_temp.topright = [260*lm.resol[0]/1920, 104*lm.resol[1]/1080]
                    lm.screen.blit(pygame.transform.scale(images.img_enemy_thought, [(36+24*len(enemy[i].attack[j].name))*lm.resol[0]/1920, 64*lm.resol[1]/1080]), img_temp)

                    action_txt = fonts.action_font.render(enemy[i].attack[j].name, True, colors.BLACK)
                    action_place = action_txt.get_rect(center=((260-(36+24*len(enemy[i].attack[j].name))/2)*lm.resol[0]/1920, (118+12)*lm.resol[1]/1080))
                    lm.screen.blit(action_txt, action_place)

                if enemy[i].category == "right":
                    img_temp = pygame.transform.scale(images.img_enemy_thought_right, [(36+24*len(enemy[i].attack[j].name))*lm.resol[0]/1920, 64*lm.resol[1]/1080]).get_rect()
                    img_temp.topleft = [700*lm.resol[0]/1920, 104*lm.resol[1]/1080]
                    lm.screen.blit(pygame.transform.scale(images.img_enemy_thought_right, [(36+24*len(enemy[i].attack[j].name))*lm.resol[0]/1920, 64*lm.resol[1]/1080]), img_temp)

                    action_txt = fonts.action_font.render(enemy[i].attack[j].name, True, colors.BLACK)
                    action_place = action_txt.get_rect(center=((700+(36+24*len(enemy[i].attack[j].name))/2)*lm.resol[0]/1920, (118+12)*lm.resol[1]/1080))
                    lm.screen.blit(action_txt, action_place)


                # 攻撃エリアを表示
                lm.screen.blit(pygame.transform.scale(pygame.image.load("./data_list/images/system/caution.png"), [96*lm.resol[0]/1920, 96*lm.resol[1]/1080]), [(264+enemy[i].attack[j].x*(96+16))*lm.resol[0]/1920, (552+enemy[i].attack[j].y*(96+16))*lm.resol[1]/1080])
            
            # 予備動作時間を減らす
            enemy[i].attack[j].preliminary -= 1/lm.fps
            
            # 予備動作時間が終わったら
            if enemy[i].attack[j].preliminary <= 0:

                # こうげき
                if enemy[i].attack[j].category == 'attack':
                    attack.enemy_attack(player, enemy[i], j, health_disp)

                # ぼうぎょ
                if enemy[i].attack[j].category == 'defense':
                    print("defense")

                # まほう
                if enemy[i].attack[j].category == 'magic':
                    magic.enemy_attack(player, enemy[i], j, health_disp)
               

                pop_temp.append(j)

        # 後ろから削除するために逆順にする（インデックスエラーを起こさないために）
        pop_temp.sort(reverse=True) 
        # 攻撃が終わった奴は削除
        for j in pop_temp:
            enemy[i].attack.pop(j)