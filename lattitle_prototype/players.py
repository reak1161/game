import pygame
import glob

import colors
import classes
import fonts
import images

import lattitle_main as lm


# ファイルからデータ読みこみ
def read_file(player_data):

    # データのパス取り込み
    player_path = glob.glob('./data_list/players/player_*/player_*.csv')

    # ファイルからデータ読みこみ
    for p in player_path:
        with open(p, 'r', encoding='utf-8') as f:
            temp = f.read().split("\n")
            data = []
            for i in range(len(temp)):
                data.append(temp[i].split(","))
            player_data.append(data)



# プレイヤーの死亡処理
def player_death(player, field_status):

    for i in range(len(player)):

        if player[i].left_HP <= 0 and player[i].alive == True:
        
            player[i].route = []
            field_status[player[i].destination[1]][player[i].destination[0]].player_exists = False

            player[i].alive = False

        


# プレイヤーアイコンを表示
def disp_player_icon(player):

    # 死んだらグレーにする
    # プレイヤーアイコン表示
    for i in range(len(player)):
        lm.screen.blit(pygame.transform.scale(player[i].image, [128*lm.resol[0]/1920, 128*lm.resol[1]/1080]), [1008*lm.resol[0]/1920, (256+i*(128+48+24+16))*lm.resol[1]/1080])

    
    # プレイヤー名表示
    for i in range(4):
        name_txt = fonts.name_font.render(player[i].name, True, colors.BLACK)
        lm.screen.blit(name_txt, name_txt.get_rect(topleft=(1008*lm.resol[0]/1920, (216+i*(128+48+24+16))*lm.resol[1]/1080)))


# プレイヤーを表示
def disp_player(player, select_player):

    for i in range(len(player)):

        # 生存中のプレイヤーを表示
        if player[i].alive == True:
            lm.screen.blit(pygame.transform.scale(player[i].image, [96*lm.resol[0]/1920, 96*lm.resol[1]/1080]), [(264+player[i].cur_location[0]*(96+16))*lm.resol[0]/1920, (552+player[i].cur_location[1]*(96+16))*lm.resol[1]/1080])
        
        #pygame.draw.rect(lm.screen, player[i].color, [76+int(player[i].cur_location[0]*(72+8)),412+int(player[i].cur_location[1]*(72+8)),72,72])
        # 選択中のプレイヤーをポップアップ
        # (それ用の画像作成　32*32を拡大)
        if select_player == i:
            if player[i].action >= 1000:
                lm.screen.blit(pygame.transform.scale(images.img_ready, [96*lm.resol[0]/1920, 96*lm.resol[1]/1080]), [(264+player[i].cur_location[0]*(96+16))*lm.resol[0]/1920, (552+player[i].cur_location[1]*(96+16))*lm.resol[1]/1080])
            else:
                lm.screen.blit(pygame.transform.scale(images.img_stay, [96*lm.resol[0]/1920, 96*lm.resol[1]/1080]), [(264+player[i].cur_location[0]*(96+16))*lm.resol[0]/1920, (552+player[i].cur_location[1]*(96+16))*lm.resol[1]/1080])

        # 防御時は重ねてプロテクトマーク的なのを表示
        if player[i].Def.valid == True:
            lm.screen.blit(pygame.transform.scale(images.img_defense, [96*lm.resol[0]/1920, 96*lm.resol[1]/1080]), [(264+player[i].cur_location[0]*(96+16))*lm.resol[0]/1920, (552+player[i].cur_location[1]*(96+16))*lm.resol[1]/1080])


# プレイヤーのゲージ類を表示
def disp_gauge(player):
    # プレイヤーHP表示（仮）
    for i in range(4):

        #lm.screen.blit(pygame.transform.scale(player[i].image, [128*lm.resol[0]/1920, 128*lm.resol[1]/1080]), [1008*lm.resol[0]/1920, (256+i*(128+48+24+16))*lm.resol[1]/1080])
        lm.screen.blit(pygame.transform.scale(images.img_hp_gauge, [264*lm.resol[0]/1920, 48*lm.resol[1]/1080]), [1200*lm.resol[0]/1920, (216+i*(40+128+48))*lm.resol[1]/1080])
        #pygame.draw.rect(lm.screen, colors.SILVER, [, 256*lm.resol[0]/1920, 24*lm.resol[1]/1080])
        
        # HPが半分以上なら緑
        if player[i].disp_HP / player[i].HP >= 0.50:
            pygame.draw.rect(lm.screen, colors.GREEN, [1204*lm.resol[0]/1920, (236+i*(40+128+48))*lm.resol[1]/1080, 256*(player[i].disp_HP/player[i].HP)*lm.resol[0]/1920, 24*lm.resol[1]/1080])
        # HPが２割以上半分未満なら黄色
        elif player[i].disp_HP / player[i].HP >= 0.20:
            pygame.draw.rect(lm.screen, colors.YELLOW, [1204*lm.resol[0]/1920, (236+i*(40+128+48))*lm.resol[1]/1080, 256*(player[i].disp_HP/player[i].HP)*lm.resol[0]/1920, 24*lm.resol[1]/1080])
        # HPが２割未満なら赤
        else:
            pygame.draw.rect(lm.screen, colors.RED, [1204*lm.resol[0]/1920, (236+i*(40+128+48))*lm.resol[1]/1080, 256*(player[i].disp_HP/player[i].HP)*lm.resol[0]/1920, 24*lm.resol[1]/1080])


    # プレイヤー魔力ゲージ表示
    for i in range(4):
        #pygame.draw.rect(lm.screen, colors.SILVER, [1208*lm.resol[0]/1920, (288+i*(40+128+48))*lm.resol[1]/1080, 256*lm.resol[0]/1920, 24*lm.resol[1]/1080])
        lm.screen.blit(pygame.transform.scale(images.img_mp_gauge, [264*lm.resol[0]/1920, 48*lm.resol[1]/1080]), [1200*lm.resol[0]/1920, (276+i*(40+128+48))*lm.resol[1]/1080])
        pygame.draw.rect(lm.screen, colors.BLUEVIOLET, [1204*lm.resol[0]/1920, (296+i*(40+128+48))*lm.resol[1]/1080, 256*(player[i].Mgc.left_MP/player[i].Mgc.MP)*lm.resol[0]/1920, 24*lm.resol[1]/1080])

    # プレイヤー行動ゲージ表示（仮）
    for i in range(4):
        #pygame.draw.rect(lm.screen, colors.SILVER, [1208*lm.resol[0]/1920, (344+i*(40+128+48))*lm.resol[1]/1080, 256*lm.resol[0]/1920, 24*lm.resol[1]/1080])
        lm.screen.blit(pygame.transform.scale(images.img_action_gauge, [264*lm.resol[0]/1920, 48*lm.resol[1]/1080]), [1200*lm.resol[0]/1920, (336+i*(40+128+48))*lm.resol[1]/1080])
        pygame.draw.rect(lm.screen, colors.YELLOW, [1204*lm.resol[0]/1920, (356+i*(40+128+48))*lm.resol[1]/1080, 256*(player[i].action/1000)*lm.resol[0]/1920, 24*lm.resol[1]/1080])


# 今回のプレイヤーを追加
def player_choice(player, player_data, current_player, field_status):

    # データリストにある名前のリスト
    name_list = [player_data[i][0][0] for i in range(len(player_data))]

    # 今回のプレイヤーの数だけ
    for i in range(len(current_player)):

        # データがあればプレイヤーを追加
        if current_player[i] in name_list:

            player.append(classes.Player(player_data[name_list.index(current_player[i])]))

            # 現在地と目的地初期化
            player[i].cur_location = [float(i), float(i)]
            player[i].destination = [i, i]
            
            # 移動経路配列
            player[i].route = []
            field_status[i][i].player_exists = True
            
            # プレイヤー画像
            player[i].image = pygame.image.load("./data_list/players/" + player[i].No + "/images/" + player[i].img)
            

# MPの自動回復
def MP_heal(player):

    for i in range(len(player)):
        
        if player[i].Mgc.recover > 0:

            if player[i].Mgc.left_MP + player[i].Mgc.recover * 1/lm.fps <= player[i].Mgc.MP:

                player[i].Mgc.left_MP += player[i].Mgc.recover * 1/lm.fps

            else:

                player[i].Mgc.left_MP = player[i].Mgc.MP


# HPをゆっくり変動させる
def HP_fluct(player):

    for i in range(len(player)):
        
        if player[i].left_HP > player[i].disp_HP:
            player[i].disp_HP += (player[i].left_HP - player[i].disp_HP) / lm.fps

        if player[i].left_HP > player[i].disp_HP:
            player[i].disp_HP += (player[i].left_HP - player[i].disp_HP) / lm.fps

        if player[i].left_HP > player[i].disp_HP:
            player[i].disp_HP += (player[i].left_HP - player[i].disp_HP) / lm.fps

        if player[i].left_HP > player[i].disp_HP:
            player[i].disp_HP += (player[i].left_HP - player[i].disp_HP) / lm.fps

        if player[i].left_HP > player[i].disp_HP:
            player[i].disp_HP += (player[i].left_HP - player[i].disp_HP) / lm.fps


        
        if player[i].left_HP < player[i].disp_HP:
            player[i].disp_HP -= (player[i].disp_HP - player[i].left_HP) / lm.fps

        if player[i].left_HP < player[i].disp_HP:
            player[i].disp_HP -= (player[i].disp_HP - player[i].left_HP) / lm.fps

        if player[i].left_HP < player[i].disp_HP:
            player[i].disp_HP -= (player[i].disp_HP - player[i].left_HP) / lm.fps

        if player[i].left_HP < player[i].disp_HP:
            player[i].disp_HP -= (player[i].disp_HP - player[i].left_HP) / lm.fps

        if player[i].left_HP < player[i].disp_HP:
            player[i].disp_HP -= (player[i].disp_HP - player[i].left_HP) / lm.fps


        if abs(player[i].left_HP - player[i].disp_HP) < 1:
            player[i].disp_HP = player[i].left_HP