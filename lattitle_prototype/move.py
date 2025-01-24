import math
import pygame


#from lattitle_main import *
import lattitle_main as lm
import colors

# ２点の距離
def dist(x1, x2):
    d = math.sqrt(pow(x2[0]-x1[0], 2)+pow(x2[1]-x1[1], 2))
    return d

# 一マス移動にかかるフレーム
def speed_time(spd, start, end):
    return lm.fps * dist(start, end) * 5 * (1/5) ** (spd/100)

# １以上なら１に
def over_one(num):
    if num >= 1:
        return 1.0
    else:
        return num

# ０以下なら０に、３以上なら３に
def in_field(num):
    if num <= 0:
        return 0.0
    elif num >= 3:
        return 3.0
    else:
        return num

# プレイヤーを経路にそって移動させる
def move(player):

    for i in range(len(player)):

        # 移動可能
        if player[i].can_move == True:

            # 移動経路があるとき
            if len(player[i].route) >= 2:

                # x軸の計算
                if player[i].route[1][0] > player[i].route[0][0]:
                    player[i].cur_location[0] += over_one(float(player[i].Def.speed / 100) * (player[i].route[1][0] - player[i].route[0][0]) / speed_time(int(player[i].Spd), player[i].route[0], player[i].route[1]))
                elif player[i].route[1][0] < player[i].route[0][0]:
                    player[i].cur_location[0] -= over_one(float(player[i].Def.speed / 100) * (player[i].route[0][0] - player[i].route[1][0]) / speed_time(int(player[i].Spd), player[i].route[0], player[i].route[1]))
                
                # y軸の計算
                if player[i].route[1][1] > player[i].route[0][1]:
                    player[i].cur_location[1] += over_one(float(player[i].Def.speed / 100) * (player[i].route[1][1] - player[i].route[0][1]) / speed_time(int(player[i].Spd), player[i].route[0], player[i].route[1]))
                elif player[i].route[1][1] < player[i].route[0][1]:
                    player[i].cur_location[1] -= over_one(float(player[i].Def.speed / 100) * (player[i].route[0][1] - player[i].route[1][1]) / speed_time(int(player[i].Spd), player[i].route[0], player[i].route[1]))

                # x座標が右行きすぎたら修正
                if player[i].route[1][0] > player[i].route[0][0] and player[i].cur_location[0] > player[i].route[1][0]:
                    player[i].cur_location[0] = float(math.floor(player[i].cur_location[0]))
                    
                # y座標が下行きすぎたら修正
                if player[i].route[1][1] > player[i].route[0][1] and player[i].cur_location[1] > player[i].route[1][1]:
                    player[i].cur_location[1] = float(math.floor(player[i].cur_location[1]))

                # x座標が左行きすぎたら修正
                if player[i].route[1][0] < player[i].route[0][0] and player[i].cur_location[0] < player[i].route[1][0]:
                    player[i].cur_location[0] = float(math.ceil(player[i].cur_location[0]))
                
                # y座標が上行きすぎたら修正
                if player[i].route[1][1] < player[i].route[0][1] and player[i].cur_location[1] < player[i].route[1][1]:
                    player[i].cur_location[1] = float(math.ceil(player[i].cur_location[1]))

                # 場外なら修正
                player[i].cur_location[0] = in_field(player[i].cur_location[0])
                player[i].cur_location[1] = in_field(player[i].cur_location[1])
                
                # 次の移動先と一致してたら削除
                if round(player[i].cur_location[0], 2) == player[i].route[1][0] and round(player[i].cur_location[1], 2) == player[i].route[1][1]:
                    player[i].route.pop(0)


# 各プレイヤーの移動経路表示
def disp_player_route(player):

    resol = lm.resol

    for i in range(len(player)):

        for j in range(len(player[i].route)):

            # 現在地から次の場所まで
            if j == 0 and len(player[i].route) >= 2:
                pygame.draw.line(lm.screen, player[i].color, [(304+player[i].cur_location[0]*(96+16)+7)*resol[0]/1920, (592+player[i].cur_location[1]*(96+16)+7)*resol[1]/1080], [(304+player[i].route[j+1][0]*(96+16)+7)*resol[0]/1920, (592+player[i].route[j+1][1]*(96+16)+7)*resol[1]/1080], int(16*resol[0]/1920))
            
            # 移動予定経路
            elif j < len(player[i].route)-1:
                pygame.draw.line(lm.screen, player[i].color, [(304+player[i].route[j][0]*(96+16)+7)*resol[0]/1920, (592+player[i].route[j][1]*(96+16)+7)*resol[1]/1080], [(304+player[i].route[j+1][0]*(96+16)+7)*resol[0]/1920, (592+player[i].route[j+1][1]*(96+16)+7)*resol[1]/1080], int(16*resol[0]/1920))
            
            # 終点
            else:
                pygame.draw.rect(lm.screen, player[i].color, [(304+player[i].route[j][0]*(96+16))*resol[0]/1920, (592+player[i].route[j][1]*(96+16))*resol[1]/1080, 16*resol[0]/1920, 16*resol[1]/1080])


# 左クリックを離したとき
def left_released(player, field_status, start_point, m_line):

    # 終点を設定
    end_point = m_line[len(m_line)-1]

    # 移動先にプレイヤーがいない（障害物などの判定も追加？）
    if field_status[end_point[1]][end_point[0]].player_exists == False:
        # 目的地が始点のやつを探して目的地を終点に設定
        for i in range(len(player)):
            if player[i].destination == start_point and player[i].alive == True:
                player[i].destination = end_point
                # 移動経路をキューに追加
                player[i].route.extend(m_line)

        # フィールド情報書き換え
        field_status[start_point[1]][start_point[0]].player_exists = False
        field_status[end_point[1]][end_point[0]].player_exists = True


# 始点が存在するなら
def start_exists(start_point, cursor, m_line):

    if start_point:
        # カーソル位置が移動経路に含まれていないなら追加
        if [cursor.x, cursor.y] not in m_line:
            m_line.append([cursor.x, cursor.y])
        else: # 到達済みならそれ以降を削除
            del m_line[m_line.index([cursor.x, cursor.y])+1:]

        # 移動予定経路を描画
        for i in range(len(m_line)):
            if i < len(m_line)-1:
                pygame.draw.line(lm.screen, colors.RED, [(304+m_line[i][0]*(96+16)+7)*lm.resol[0]/1920, (592+m_line[i][1]*(96+16)+7)*lm.resol[1]/1080], [(304+m_line[i+1][0]*(96+16)+7)*lm.resol[0]/1920, (592+m_line[i+1][1]*(96+16)+7)*lm.resol[1]/1080], int(16*lm.resol[0]/1920))
            else:
                pygame.draw.rect(lm.screen, colors.RED, [(304+m_line[i][0]*(96+16))*lm.resol[0]/1920, (592+m_line[i][1]*(96+16))*lm.resol[1]/1080, 16*lm.resol[0]/1920, 16*lm.resol[1]/1080])

    


def move_route(m_btnl, field_status, player, mouse_x, mouse_y, cursor, m_line, start_point):
    print("move_route")
    """
    resol = lm.resol

    # 左クリックを離したとき
    if m_btnl == False and m_line: # 移動経路が存在し、左クリックが押されていない

        # 終点を設定
        end_point = m_line[len(m_line)-1]

        # 移動先になにもない
        if field_status[end_point[1]][end_point[0]] == 0:
            # 目的地が始点のやつを探して目的地を終点に設定
            for i in range(4):
                if player[i].destination == start_point:
                    player[i].destination = end_point
                    # 移動経路をキューに追加
                    player[i].route.extend(m_line)
                    #select_player = i

            # フィールド情報書き換え
            field_status[start_point[1]][start_point[0]] = 0
            field_status[end_point[1]][end_point[0]] = 1

    # 左クリックが範囲内で押されているとき
    if m_btnl == True and cursor.x >= 0:

        # プレイヤーを選択
        if not m_line:
            for i in range(4):
                if (264+player[i].cur_location[0]*(96+16))*resol[0]/1920 <= mouse_x < (264+player[i].cur_location[0]*(96+16)+96)*resol[0]/1920 and (552+player[i].cur_location[1]*(96+16))*resol[1]/1080 <= mouse_y < (552+player[i].cur_location[1]*(96+16)+96)*resol[1]/1080:
                    select_player = i

        # カーソル位置にプレイヤーが存在し、始点が存在しないなら
        if field_status[cursor.y][cursor.x] == 1 and not start_point:
            start_point = [cursor.x, cursor.y]

        # 始点が存在するなら
        if start_point:
            # カーソル位置が移動経路に含まれていないなら追加
            if [cursor.x, cursor.y] not in m_line:
                m_line.append([cursor.x, cursor.y])
            else: # 到達済みならそれ以降を削除
                del m_line[m_line.index([cursor.x, cursor.y])+1:]

            # 移動経路を描画
            for i in range(len(m_line)):
                if i < len(m_line)-1:
                    pygame.draw.line(lm.screen, colors.RED, [(304+m_line[i][0]*(96+16)+7)*resol[0]/1920, (592+m_line[i][1]*(96+16)+7)*resol[1]/1080], [(304+m_line[i+1][0]*(96+16)+7)*resol[0]/1920, (592+m_line[i+1][1]*(96+16)+7)*resol[1]/1080], int(16*resol[0]/1920))
                else:
                    pygame.draw.rect(lm.screen, colors.RED, [(304+m_line[i][0]*(96+16))*resol[0]/1920, (592+m_line[i][1]*(96+16))*resol[1]/1080, 16*resol[0]/1920, 16*resol[1]/1080])

    else: # 離したら移動経路と始点を削除
        m_line = []
        start_point = []


        """