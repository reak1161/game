# 初期化
def init(enemy):
    
    # 半分保証
    enemy.passive[0].valid = True

    # 共鳴　無効
    enemy.passive[1].valid = False
    enemy.passive[1].disp_name = "　共鳴　"


# 半分保証
# ボス用のパッシブ
# HPが一度だけ半分で停止する
def half_guarantee(enemy):

    if enemy.passive[0].valid == True:

        # HPが半分未満になったとき
        if enemy.left_HP / enemy.HP <= 0.50:
            
            print("半分保証")

            # HPを半分にする
            enemy.left_HP = enemy.HP / 2 - 1

            # 半分保証を無効にする
            enemy.passive[0].valid = False


# 共鳴
# 自分が死亡したとき、もう片方が生きていれば、
# 行動ゲージが溜まった後、HP半分で復活する。
def resonance(enemy, index):
    
    
    if enemy[index].passive[1].valid == False:

        # 死亡したとき
        if enemy[index].left_HP <= 0:

            for i in range(len(enemy)):

                # 自分以外
                if i != index:

                    for j in range(len(enemy[i].passive)):

                        # 自分以外に「共鳴」持ちがいて、生きているなら
                        if enemy[i].passive[j].name == 'resonance' and enemy[i].alive == True:

                            # 行動ゲージリセット
                            enemy[index].action = 0.0

                            # 共鳴を有効
                            enemy[index].passive[1].valid = True

                            # 相方のインデックスを保存
                            global resonance_index
                            resonance_index = i

                            print("共鳴")
                            enemy[index].passive[1].disp = 5.0

    # 共鳴中
    if enemy[index].passive[1].valid == True:

        # 行動ゲージが溜まって、まだ相方が生きているなら
        if enemy[index].action >= 1000 and enemy[resonance_index].alive == True:

            # HPを半分にする
            enemy[index].left_HP = enemy[index].HP / 2 - 1

            # 生存判定
            enemy[index].alive = True

            # 行動ゲージをゼロにする
            enemy[index].action = 0

            print("共鳴発動")

            # 共鳴を無効
            enemy[index].passive[1].valid = False
                            





# パッシブを実行
# 敵リストと行動中の敵インデックスを引数に？
def passive_exe(enemy, index):

    # 半分保証
    half_guarantee(enemy[index])
    
    # 共鳴
    resonance(enemy, index)