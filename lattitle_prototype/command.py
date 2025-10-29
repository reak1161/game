import pygame

import colors
import fonts

import buttons
import images

import lattitle_main as lm

# コマンドボタン表示
def disp(player, select_player, press_button, command_button):

    resol = lm.resol
    screen = lm.screen

    pygame.draw.rect(screen, colors.D_GLAY, [248*resol[0]/1920, 448*resol[1]/1080, 464*resol[0]/1920, 64*resol[1]/1080])

    for i in range(0, 4):
        # プレイヤーを選択していない場合はグレー
        if select_player == -1:
            pygame.draw.rect(screen, colors.SILVER, command_button[i])
        
        else:
            # 行動ゲージがたまっていて、行動可能なら緑
            if player[select_player].action >= 1000 and player[select_player].can_attack == True:
                if i == press_button:
                    pygame.draw.rect(screen, colors.GOLD, command_button[i])
                else:
                    pygame.draw.rect(screen, colors.GREEN, command_button[i])
            # 選択中だけど行動できないならシアン
            else:
                pygame.draw.rect(screen, colors.CYAN, command_button[i])
            
            if player[select_player].command[i].category == "attack":
                screen.blit(fonts.com_font.render("こうげき", True, colors.BLACK), [264*resol[0]/1920+i*(96+16)*resol[1]/1080, 456*resol[1]/1080])
            if player[select_player].command[i].category == "defense":
                screen.blit(fonts.com_font.render("ぼうぎょ", True, colors.BLACK), [264*resol[0]/1920+i*(96+16)*resol[1]/1080, 456*resol[1]/1080])
            if player[select_player].command[i].category == "magic":
                screen.blit(fonts.com_font.render("まほう", True, colors.BLACK), [264*resol[0]/1920+i*(96+16)*resol[1]/1080, 456*resol[1]/1080])
            if player[select_player].command[i].category == "skill":
                screen.blit(fonts.com_font.render("こうどう", True, colors.BLACK), [264*resol[0]/1920+i*(96+16)*resol[1]/1080, 456*resol[1]/1080])
            if player[select_player].command[i].category == "item":
                screen.blit(fonts.com_font.render("アイテム", True, colors.BLACK), [264*resol[0]/1920+i*(96+16)*resol[1]/1080, 456*resol[1]/1080])


def command_text_disp(txt, place):
    temp_txt = fonts.com_pop_font.render(txt, True, colors.WHITE)
    temp_place = temp_txt.get_rect(topleft=(place[0]*lm.resol[0]/1920, place[1]*lm.resol[1]/1080))
    lm.screen.blit(temp_txt, temp_place)


# コマンドボタンにカーソルをあわせているときわざ詳細を表示
def command_pop_up(player, select_player, mouse, item, picked_item):

    if select_player != -1:

        for i in range(4):
            if buttons.command_button[i][0] <= mouse.x < buttons.command_button[i][0] + buttons.command_button[i][2]:
                if buttons.command_button[i][1] <= mouse.y < buttons.command_button[i][1] + buttons.command_button[i][3]:
                    img_temp = pygame.transform.scale(images.img_command_back, [464*lm.resol[0]/1920, 96*lm.resol[1]/1080]).get_rect()
                    img_temp.topleft = [248*lm.resol[0]/1920, 336*lm.resol[1]/1080]
                    lm.screen.blit(pygame.transform.scale(images.img_command_back, [464*lm.resol[0]/1920, 96*lm.resol[1]/1080]), img_temp)

                    if player[select_player].command[i].category == 'attack':
                        command_text_disp(player[select_player].command[i].name, [252, 340])
                        command_text_disp('威力:'+str(player[select_player].command[i].power), [406, 340])
                        command_text_disp(player[select_player].command[i].element, [559, 340])
                        command_text_disp('チャージ時間:'+str(player[select_player].command[i].charge_time), [252, 364])
                        command_text_disp('攻撃範囲:'+str(player[select_player].command[i].range), [406, 364])
                        command_text_disp('攻撃回数:'+str(player[select_player].command[i].frequency), [559, 364])

                    if player[select_player].command[i].category == 'defense':
                        command_text_disp(player[select_player].command[i].name, [252, 340])
                        command_text_disp('軽減率:'+str(player[select_player].command[i].reduce_percent)+'%', [406, 340])
                        command_text_disp('軽減数:'+str(player[select_player].command[i].reduce_const), [559, 340])
                        command_text_disp('移動補正:'+str(player[select_player].command[i].speed)+'%', [252, 364])
                        command_text_disp('耐属性補正:'+str(player[select_player].command[i].element_percent)+'%', [406, 364])
                        command_text_disp('耐属性軽減:'+str(player[select_player].command[i].element_const), [559, 364])

                    if player[select_player].command[i].category == 'magic':
                        command_text_disp(player[select_player].command[i].name, [252, 340])
                        command_text_disp('威力:'+str(player[select_player].command[i].power), [406, 340])
                        command_text_disp(player[select_player].command[i].element, [559, 340])
                        #command_text_disp('消費魔力:'+str(player[select_player].command[i].MP_percent)+'%+'+str(player[select_player].command[i].MP_const), [252, 364])
                        command_text_disp('消費魔力:'+str(round(player[select_player].Mgc.left_MP * player[select_player].command[i].MP_percent / 100 + player[select_player].command[i].MP_const, 1)), [252, 364])
                        command_text_disp('チャージ時間:'+str(player[select_player].command[i].charge_time), [406, 364])
                        command_text_disp('攻撃範囲:'+str(player[select_player].command[i].range), [559, 364])
                        

                    if player[select_player].command[i].category == 'item':
                        command_text_disp('選択中のアイテム', [252, 340])
                        if picked_item != -1:
                            command_text_disp(item[picked_item].disp_name, [252, 364])
                            command_text_disp('残り個数:'+str(item[picked_item].amount), [406, 364])
