import pygame
import math

import lattitle_main as lm

import fonts
import colors

import buff
import debuff

def player_effect(player, enemy, health_disp, mana_disp, side_display):

    for i in range(len(player)):
        
        # 削除するやつを一時的に保存
        pop_temp = []

        # 状態異常を消化
        for j in range(len(player[i].effect)):
        
            # （残り時間が存在しない状態異常のことも考える）
            
            # バフ発動
            if player[i].effect[j].category == 'buff':
                buff.buff_choice(player, enemy, player[i], j,  health_disp, mana_disp)

            # デバフを発動
            if player[i].effect[j].category == 'debuff':
                debuff.debuff_choice(player, enemy, player[i], j,  health_disp, mana_disp)

            # 制限時間がある場合
            if type(player[i].effect[j].time) == float:
                
                # 効果時間が残ってる
                if player[i].effect[j].time > 0:

                    # 残り時間を減らす
                    player[i].effect[j].time -= 1 / lm.fps

                    # 画像を表示
                    if side_display == 'players':
                        if j < 9: # ９個までは画像を表示
                            
                            # エフェクトの画像を表示
                            lm.screen.blit(pygame.transform.scale(player[i].effect[j].image, [64*lm.resol[0]/1920, 64*lm.resol[1]/1080]), [(1520+(j%5)*(64+8))*lm.resol[0]/1920, (240+int(j/5)*(64+8)+i*(168+48))*lm.resol[1]/1080])
                        
                            # 残り時間を表示
                            time_txt = fonts.effect_time_font.render(str(math.ceil(player[i].effect[j].time)), True, colors.BLACK)
                            lm.screen.blit(time_txt, time_txt.get_rect(bottomright=((1520+64+(j%5)*(64+8))*lm.resol[0]/1920, (240+64+int(j/5)*(64+8)+i*(168+48))*lm.resol[1]/1080)))

                # 効果時間終了時
                else:
                    
                    # 削除する配列に加える
                    pop_temp.append(j)

            # 条件を満たすまで終わらない場合
            else:

                # 効果が有効
                if player[i].effect[j].time == True:

                    # 画像を表示
                    if side_display == 'players':
                        if j < 9: # ９個までは画像を表示
                            
                            # エフェクトの画像を表示
                            lm.screen.blit(pygame.transform.scale(player[i].effect[j].image, [64*lm.resol[0]/1920, 64*lm.resol[1]/1080]), [(1520+(j%5)*(64+8))*lm.resol[0]/1920, (240+int(j/5)*(64+8)+i*(168+48))*lm.resol[1]/1080])

                # 効果終了時
                else:
                    
                    # 削除する配列に加える
                    pop_temp.append(j)
                    
        
        # 後ろから削除するために逆順にする（インデックスエラーを起こさないために）
        pop_temp.sort(reverse=True) 
        # 攻撃が終わった奴は削除
        for j in pop_temp:
            player[i].effect.pop(j)