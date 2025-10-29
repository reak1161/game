import pygame

import lattitle_main as lm
import colors
import fonts
import buttons

def disp_main_menu():
    
    # タイトル表示
    title_txt = fonts.title_font.render("ラティトル", True, colors.BLACK)
    title_place = title_txt.get_rect(center=(960*lm.resol[0]/1920, 330*lm.resol[1]/1080))
    lm.screen.blit(title_txt, title_place)

    # ゲームプレイボタン表示
    pygame.draw.rect(lm.screen, colors.SILVER, buttons.game_play_button)
    game_play_txt = fonts.title_button_font.render("ゲームプレイ", True, colors.BLACK)
    game_play_place = game_play_txt.get_rect(center=(960*lm.resol[0]/1920, 570*lm.resol[1]/1080))
    lm.screen.blit(game_play_txt, game_play_place)

    """
    # 設定ボタン表示
    # 設定は後々追加する
    pygame.draw.rect(lm.screen, colors.SILVER, buttons.title_option_button)
    title_option_txt = fonts.title_button_font.render("設定", True, colors.BLACK)
    title_option_place = title_option_txt.get_rect(center=(960*lm.resol[0]/1920, 780*lm.resol[1]/1080))
    lm.screen.blit(title_option_txt, title_option_place)
    """