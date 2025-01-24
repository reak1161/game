import pygame

import colors
import fonts
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