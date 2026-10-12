import pygame
import glob

from importlib import import_module

import classes
import colors
import fonts
import images

import lattitle_main as lm


# ファイルからデータ読みこみ
def read_file(enemy_data):
    
    # データのパス取り込み
    enemy_path = glob.glob('./data_list/enemies/enemy_*/enemy_*.csv')

    # ファイルからデータ読みこみ
    for p in enemy_path:
        with open(p, 'r', encoding='utf-8') as f:
            temp = f.read().split("\n")
            data = []
            for i in range(len(temp)):
                data.append(temp[i].split(","))
            enemy_data.append(data)

# 敵の死亡処理
def enemy_death(enemy):

    for i in range(len(enemy)):

        if enemy[i].left_HP <= 0 and enemy[i].alive == True:

            enemy[i].alive = False
            enemy[i].attack = []


# 敵を表示
def disp_enemy(enemy):

    for i in range(len(enemy)):

        # （元画像のサイズ比をそのままにするようにする？）
        # 画像を表示
        # 後で修正

        # ボス 64*64
        if enemy[i].category == "boss":
            #pygame.draw.rect(screen, colors.CYAN, [(480-8)*resol[0]/1920, (232-8)*resol[1]/1080, 16*resol[0]/1920, 16*resol[1]/1080])
            img_temp = pygame.transform.scale(enemy[i].image, [384*lm.resol[0]/1920, 384*lm.resol[1]/1080]).get_rect()
            img_temp.center = [480*lm.resol[0]/1920, 232*lm.resol[1]/1080]
            lm.screen.blit(pygame.transform.scale(enemy[i].image, [384*lm.resol[0]/1920, 384*lm.resol[1]/1080]), img_temp)

            # 名前
            name_txt = fonts.name_font.render(enemy[i].name, True, colors.BLACK)
            name_place = name_txt.get_rect(center=(480*lm.resol[0]/1920, 412*lm.resol[1]/1080))
            img_temp = pygame.transform.scale(images.img_name_back, [(24+24*len(enemy[i].name))*lm.resol[0]/1920, 24*lm.resol[1]/1080]).get_rect()
            img_temp.center = [480*lm.resol[0]/1920, 412*lm.resol[1]/1080]
            lm.screen.blit(pygame.transform.scale(images.img_name_back, [(24+24*len(enemy[i].name))*lm.resol[0]/1920, 24*lm.resol[1]/1080]), img_temp)
            lm.screen.blit(name_txt, name_place)

        # 左 32*64
        if enemy[i].category == "left":
            img_temp = pygame.transform.scale(enemy[i].image, [192*lm.resol[0]/1920, 384*lm.resol[1]/1080]).get_rect()
            img_temp.center = [372*lm.resol[0]/1920, 232*lm.resol[1]/1080]
            lm.screen.blit(pygame.transform.scale(enemy[i].image, [192*lm.resol[0]/1920, 384*lm.resol[1]/1080]), img_temp)

            # 名前
            name_txt = fonts.name_font.render(enemy[i].name, True, colors.BLACK)
            name_place = name_txt.get_rect(center=(372*lm.resol[0]/1920, 412*lm.resol[1]/1080))
            img_temp = pygame.transform.scale(images.img_name_back, [(24+24*len(enemy[i].name))*lm.resol[0]/1920, 24*lm.resol[1]/1080]).get_rect()
            img_temp.center = [372*lm.resol[0]/1920, 412*lm.resol[1]/1080]
            lm.screen.blit(pygame.transform.scale(images.img_name_back, [(24+24*len(enemy[i].name))*lm.resol[0]/1920, 24*lm.resol[1]/1080]), img_temp)
            lm.screen.blit(name_txt, name_place)

        # 右 32*64
        if enemy[i].category == "right":
            img_temp = pygame.transform.scale(enemy[i].image, [192*lm.resol[0]/1920, 384*lm.resol[1]/1080]).get_rect()
            img_temp.center = [588*lm.resol[0]/1920, 232*lm.resol[1]/1080]
            lm.screen.blit(pygame.transform.scale(enemy[i].image, [192*lm.resol[0]/1920, 384*lm.resol[1]/1080]), img_temp)

            # 名前
            name_txt = fonts.name_font.render(enemy[i].name, True, colors.BLACK)
            name_place = name_txt.get_rect(center=(588*lm.resol[0]/1920, 412*lm.resol[1]/1080))
            img_temp = pygame.transform.scale(images.img_name_back, [(24+24*len(enemy[i].name))*lm.resol[0]/1920, 24*lm.resol[1]/1080]).get_rect()
            img_temp.center = [588*lm.resol[0]/1920, 412*lm.resol[1]/1080]
            lm.screen.blit(pygame.transform.scale(images.img_name_back, [(24+24*len(enemy[i].name))*lm.resol[0]/1920, 24*lm.resol[1]/1080]), img_temp)
            lm.screen.blit(name_txt, name_place)
        


# 敵HPを表示
def disp_HP(enemy):

    # （敵の上に表示されるように）
    # 後で修正
    # ボス用HPフレームを作る

    for i in range(len(enemy)):
        
        if enemy[i].category == "boss":
            pygame.draw.rect(lm.screen, colors.SILVER, [288*lm.resol[0]/1920, 40*lm.resol[1]/1080, 384*lm.resol[0]/1920, 32*lm.resol[1]/1080])
            #lm.screen.blit(pygame.transform.scale(images.img_hp_gauge, [*lm.resol[0]/1920, 64*lm.resol[1]/1080]), [1200*lm.resol[0]/1920, (256+i*(40+128+48))*lm.resol[1]/1080])

            # HPが半分以上なら緑
            if enemy[i].disp_HP / enemy[i].HP >= 0.50:
                pygame.draw.rect(lm.screen, colors.GREEN, [288*lm.resol[0]/1920, 40*lm.resol[1]/1080, 384*(enemy[i].disp_HP/enemy[i].HP)*lm.resol[0]/1920, 32*lm.resol[1]/1080])
            # HPが２割以上半分未満なら黄色
            elif enemy[i].disp_HP / enemy[i].HP >= 0.20:
                pygame.draw.rect(lm.screen, colors.YELLOW, [288*lm.resol[0]/1920, 40*lm.resol[1]/1080, 384*(enemy[i].disp_HP/enemy[i].HP)*lm.resol[0]/1920, 32*lm.resol[1]/1080])
            # HPが２割未満なら赤
            else:
                pygame.draw.rect(lm.screen, colors.RED, [288*lm.resol[0]/1920, 40*lm.resol[1]/1080, 384*(enemy[i].disp_HP/enemy[i].HP)*lm.resol[0]/1920, 32*lm.resol[1]/1080])

        if enemy[i].category == "left":
            pygame.draw.rect(lm.screen, colors.SILVER, [276*lm.resol[0]/1920, 40*lm.resol[1]/1080, 192*lm.resol[0]/1920, 32*lm.resol[1]/1080])

            # HPが半分以上なら緑
            if enemy[i].disp_HP / enemy[i].HP >= 0.50:
                pygame.draw.rect(lm.screen, colors.GREEN, [276*lm.resol[0]/1920, 40*lm.resol[1]/1080, 192*(enemy[i].disp_HP/enemy[i].HP)*lm.resol[0]/1920, 32*lm.resol[1]/1080])
            # HPが２割以上半分未満なら黄色
            elif enemy[i].disp_HP / enemy[i].HP >= 0.20:
                pygame.draw.rect(lm.screen, colors.YELLOW, [276*lm.resol[0]/1920, 40*lm.resol[1]/1080, 192*(enemy[i].disp_HP/enemy[i].HP)*lm.resol[0]/1920, 32*lm.resol[1]/1080])
            # HPが２割未満なら赤
            else:
                pygame.draw.rect(lm.screen, colors.RED, [276*lm.resol[0]/1920, 40*lm.resol[1]/1080, 192*(enemy[i].disp_HP/enemy[i].HP)*lm.resol[0]/1920, 32*lm.resol[1]/1080])

        if enemy[i].category == "right":
            pygame.draw.rect(lm.screen, colors.SILVER, [492*lm.resol[0]/1920, 40*lm.resol[1]/1080, 192*lm.resol[0]/1920, 32*lm.resol[1]/1080])

            # HPが半分以上なら緑
            if enemy[i].disp_HP / enemy[i].HP >= 0.50:
                pygame.draw.rect(lm.screen, colors.GREEN, [492*lm.resol[0]/1920, 40*lm.resol[1]/1080, 192*(enemy[i].disp_HP/enemy[i].HP)*lm.resol[0]/1920, 32*lm.resol[1]/1080])
            # HPが２割以上半分未満なら黄色
            elif enemy[i].disp_HP / enemy[i].HP >= 0.20:
                pygame.draw.rect(lm.screen, colors.YELLOW, [492*lm.resol[0]/1920, 40*lm.resol[1]/1080, 192*(enemy[i].disp_HP/enemy[i].HP)*lm.resol[0]/1920, 32*lm.resol[1]/1080])
            # HPが２割未満なら赤
            else:
                pygame.draw.rect(lm.screen, colors.RED, [492*lm.resol[0]/1920, 40*lm.resol[1]/1080, 192*(enemy[i].disp_HP/enemy[i].HP)*lm.resol[0]/1920, 32*lm.resol[1]/1080])

            
    
        """
        pygame.draw.rect(screen, colors.RED, [284*resol[0]/1920, 40*resol[1]/1080, 384/384*enemy[0].image.get_rect()[2]*resol[0]/1920, 32/384*enemy[0].image.get_rect()[3]*resol[1]/1080])
        pygame.draw.rect(screen, colors.GREEN, [60+44,48, 256*((enemy[0].left_HP)/enemy[0].HP)/256*enemy[0].image.get_rect()[2], 24/256*enemy[0].image.get_rect()[3]])
        """





# 今回の敵を追加する
def enemy_choice(enemy, enemy_data, current_enemy):
    n = 0
    for i in range(len(enemy_data)):

        # 今回の敵を追加
        if enemy_data[i][0][0] in current_enemy:
            enemy.append(classes.Enemy(enemy_data[i]))

            # 敵画像
            enemy[n].image = pygame.image.load("./data_list/enemies/" + enemy[n].No + "/images/" + enemy[n].img)
            # 攻撃予定配列 初期化
            enemy[n].attack = []

            # こうどう
            enemy[n].action_path = import_module(".action", "data_list.enemies." + enemy[n].No)

            # パッシブ
            enemy[n].passive_path = import_module(".passive", "data_list.enemies." + enemy[n].No)

            n += 1

    passive_init(enemy)

    #print(vars(enemy[0]))


# パッシブ初期化
def passive_init(enemy):

    for i in range(len(enemy)):
        
        enemy[i].passive_path.init(enemy[i])


# 敵のパッシブ
def enemy_passive(enemy):

    for i in range(len(enemy)):

        enemy[i].passive_path.passive_exe(enemy, i)

        for j in range(len(enemy[i].passive)):

            if enemy[i].passive[j].disp > 0:

                # 技名を表示
                if enemy[i].category == "boss":
                    img_temp = pygame.transform.scale(images.img_enemy_thought_right, [(36+24*len(enemy[i].passive[j].disp_name))*lm.resol[0]/1920, 64*lm.resol[1]/1080]).get_rect()
                    img_temp.topleft = [700*lm.resol[0]/1920, (104+64)*lm.resol[1]/1080]
                    lm.screen.blit(pygame.transform.scale(images.img_enemy_thought_right, [(36+24*len(enemy[i].passive[j].disp_name))*lm.resol[0]/1920, 64*lm.resol[1]/1080]), img_temp)

                    passive_txt = fonts.passive_font.render(enemy[i].passive[j].disp_name, True, colors.BLACK)
                    passive_place = passive_txt.get_rect(center=((700+(36+24*len(enemy[i].passive[j].disp_name))/2)*lm.resol[0]/1920, (118+12+64)*lm.resol[1]/1080))
                    lm.screen.blit(passive_txt, passive_place)
                
                if enemy[i].category == "left":
                    img_temp = pygame.transform.scale(images.img_enemy_thought, [(36+24*len(enemy[i].passive[j].disp_name))*lm.resol[0]/1920, 64*lm.resol[1]/1080]).get_rect()
                    img_temp.topright = [260*lm.resol[0]/1920, (104+64)*lm.resol[1]/1080]
                    lm.screen.blit(pygame.transform.scale(images.img_enemy_thought, [(36+24*len(enemy[i].passive[j].disp_name))*lm.resol[0]/1920, 64*lm.resol[1]/1080]), img_temp)

                    passive_txt = fonts.passive_font.render(enemy[i].passive[j].disp_name, True, colors.BLACK)
                    passive_place = passive_txt.get_rect(center=((260-(36+24*len(enemy[i].passive[j].disp_name))/2)*lm.resol[0]/1920, (118+12+64)*lm.resol[1]/1080))
                    lm.screen.blit(passive_txt, passive_place)

                if enemy[i].category == "right":
                    img_temp = pygame.transform.scale(images.img_enemy_thought_right, [(36+24*len(enemy[i].passive[j].disp_name))*lm.resol[0]/1920, 64*lm.resol[1]/1080]).get_rect()
                    img_temp.topleft = [700*lm.resol[0]/1920, (104+64)*lm.resol[1]/1080]
                    lm.screen.blit(pygame.transform.scale(images.img_enemy_thought_right, [(36+24*len(enemy[i].passive[j].disp_name))*lm.resol[0]/1920, 64*lm.resol[1]/1080]), img_temp)

                    passive_txt = fonts.passive_font.render(enemy[i].passive[j].disp_name, True, colors.BLACK)
                    passive_place = passive_txt.get_rect(center=((700+(36+24*len(enemy[i].passive[j].disp_name))/2)*lm.resol[0]/1920, (118+12+64)*lm.resol[1]/1080))
                    lm.screen.blit(passive_txt, passive_place)

                # 表示時間を減らす
                enemy[i].passive[j].disp -= 1/lm.fps


# MPの自動回復
def MP_heal(enemy):

    for i in range(len(enemy)):
        
        if enemy[i].Mgc.recover > 0:

            if enemy[i].Mgc.left_MP + enemy[i].Mgc.recover * 1/lm.fps <= enemy[i].Mgc.MP:

                enemy[i].Mgc.left_MP += enemy[i].Mgc.recover * 1/lm.fps

            else:

                enemy[i].Mgc.left_MP = enemy[i].Mgc.MP


# HPをゆっくり変動させる
def HP_fluct(enemy):

    for i in range(len(enemy)):
        
        if enemy[i].left_HP > enemy[i].disp_HP:
            enemy[i].disp_HP += (enemy[i].left_HP - enemy[i].disp_HP) / lm.fps

        if enemy[i].left_HP > enemy[i].disp_HP:
            enemy[i].disp_HP += (enemy[i].left_HP - enemy[i].disp_HP) / lm.fps

        if enemy[i].left_HP > enemy[i].disp_HP:
            enemy[i].disp_HP += (enemy[i].left_HP - enemy[i].disp_HP) / lm.fps

        if enemy[i].left_HP > enemy[i].disp_HP:
            enemy[i].disp_HP += (enemy[i].left_HP - enemy[i].disp_HP) / lm.fps

        if enemy[i].left_HP > enemy[i].disp_HP:
            enemy[i].disp_HP += (enemy[i].left_HP - enemy[i].disp_HP) / lm.fps


        
        if enemy[i].left_HP < enemy[i].disp_HP:
            enemy[i].disp_HP -= (enemy[i].disp_HP - enemy[i].left_HP) / lm.fps

        if enemy[i].left_HP < enemy[i].disp_HP:
            enemy[i].disp_HP -= (enemy[i].disp_HP - enemy[i].left_HP) / lm.fps

        if enemy[i].left_HP < enemy[i].disp_HP:
            enemy[i].disp_HP -= (enemy[i].disp_HP - enemy[i].left_HP) / lm.fps

        if enemy[i].left_HP < enemy[i].disp_HP:
            enemy[i].disp_HP -= (enemy[i].disp_HP - enemy[i].left_HP) / lm.fps

        if enemy[i].left_HP < enemy[i].disp_HP:
            enemy[i].disp_HP -= (enemy[i].disp_HP - enemy[i].left_HP) / lm.fps