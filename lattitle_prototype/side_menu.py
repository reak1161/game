import pygame

import colors

import lattitle_main as lm

# サイドメニュー表示
def disp_side_menu():

    # サイドメニュー上側
    pygame.draw.rect(lm.screen, colors.SIDE_UPPER, (960*lm.resol[0]/1920, 0, 960*lm.resol[0]/1920, 168*lm.resol[1]/1080))

    # サイドメニュー下側
    pygame.draw.rect(lm.screen, colors.BLACK, (960*lm.resol[0]/1920, 168*lm.resol[1]/1080, 960*lm.resol[0]/1920, (1080-168)*lm.resol[1]/1080))
    pygame.draw.rect(lm.screen, colors.BEIGE_CAMEO, (964*lm.resol[0]/1920, 172*lm.resol[1]/1080, 952*lm.resol[0]/1920, (1080-168-8)*lm.resol[1]/1080))

    # 非選択時のサイドメニューボタン
    pygame.draw.rect(lm.screen, colors.BLACK, (1008*lm.resol[0]/1920, 124*lm.resol[1]/1080, 192*lm.resol[0]/1920, 48*lm.resol[1]/1080))
    pygame.draw.rect(lm.screen, colors.SILVER, (1012*lm.resol[0]/1920, 128*lm.resol[1]/1080, 184*lm.resol[0]/1920, 46*lm.resol[1]/1080))
    pygame.draw.rect(lm.screen, colors.BLACK, (1272*lm.resol[0]/1920, 124*lm.resol[1]/1080, 192*lm.resol[0]/1920, 48*lm.resol[1]/1080))
    pygame.draw.rect(lm.screen, colors.SILVER, (1276*lm.resol[0]/1920, 128*lm.resol[1]/1080, 184*lm.resol[0]/1920, 46*lm.resol[1]/1080))