import lattitle_main as lm
import random

# スピードアップ
def speed_up(target, index):
    
    if target.effect[index].time > 0:
        # ２度実行しないために
        if target.effect[index].other_arg[0] == 0:

            # 第２引数に増加倍率
            target.Spd *= ((100 + target.effect[index].other_arg[1]) / 100)

            # 第１引数はフラグの代わり
            target.effect[index].other_arg[0] = 1

            #　ステータス変動の配列をそれぞれ用意する
            # クラスは名前，固定／倍率，数値の要素
            # もしくはバフ系は直接操作しちゃってもいいかな

    else:

        # 元のスピードに戻す
        target.Spd /= ((100 + target.effect[index].other_arg[1]) / 100)



# バフ選択
def buff_choice(player, enemy, target, index, health_disp, mana_disp):

    if target.effect[index].name == 'speed_up':
        speed_up(target, index)