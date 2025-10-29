import pygame

import colors
import images

import lattitle_main as lm


# フィールド状態用クラス
class Field_status:

    def __init__(self):

        # プレイヤーがいるか
        self.player_exists = False

        # 状態異常
        self.effect = []


# 盤面初期化
def init(field_location, field_status):

    # フィールド状態をクラスに変更
    for i in range(4):
        for j in range(4):
            field_status[j][i] = Field_status()

    # （座標は左上だけ決めて、他はfor文で初期化する）
    # field_location[ｙ軸][ｘ軸][始点/終点/サイズ][ｘ/ｙ座標（サイズ）]
    field_location[0][0][0] = [264*lm.resol[0]/1920, 552*lm.resol[1]/1080]
    field_location[0][0][1] = [field_location[0][0][0][0]+96*lm.resol[0]/1920, field_location[0][0][0][1]+96*lm.resol[1]/1080]
    field_location[0][0][2] = [96*lm.resol[0]/1920, 96*lm.resol[1]/1080]

    for i in range(4):
        for j in range(4):
            field_location[i][j][0] = [field_location[0][0][0][0]+j*(96+16)*lm.resol[0]/1920, field_location[0][0][0][1]+i*(96+16)*lm.resol[1]/1080]
            field_location[i][j][1] = [field_location[i][j][0][0]+96*lm.resol[0]/1920, field_location[i][j][0][1]+96*lm.resol[1]/1080]
            field_location[i][j][2] = [96*lm.resol[0]/1920, 96*lm.resol[1]/1080]



# 盤面表示　（後々変える？）
def field_disp(field_location, field_status):

    # 枠
    pygame.draw.rect(lm.screen, colors.D_GLAY, [248*lm.resol[0]/1920, 536*lm.resol[1]/1080, 464*lm.resol[0]/1920, 464*lm.resol[1]/1080])

    for i in range(0, 4):
        for j in range(0, 4):

            pygame.draw.rect(lm.screen, colors.SILVER, [field_location[i][j][0], field_location[i][j][2]])


# カーソル位置
def cursor_loc(field_location, mouse, cursor):

    if field_location[0][0][0][0] <= mouse.x < field_location[3][3][1][0] and field_location[0][0][0][1] <= mouse.y < field_location[3][3][1][1]:
        for i in range(4):
            for j in range(4):
                if field_location[i][j][0][0] <= mouse.x < field_location[i][j][1][0] and field_location[i][j][0][1] <= mouse.y < field_location[i][j][1][1]:
                    cursor.x = j
                    cursor.y = i
    else: # 枠外
        cursor.x = -1
        cursor.y = -1


# カーソル表示
def cursor_disp(field_location, cursor):
    
    for i in range(0, 4):
        for j in range(0, 4):
            if cursor.x == j and cursor.y == i:
                
                lm.screen.blit(pygame.transform.scale(images.img_cursor, [96*lm.resol[0]/1920, 96*lm.resol[1]/1080]), field_location[cursor.y][cursor.x][0])