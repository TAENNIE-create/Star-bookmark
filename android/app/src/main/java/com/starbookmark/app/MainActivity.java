package com.starbookmark.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // 스플래시: styles.xml의 android:windowBackground=@drawable/splash 로 전체 이미지 표시
        // Theme.SplashScreen 사용 시 Android 12+에서 splash.png 무시되고 아이콘+단색만 표시됨
        super.onCreate(savedInstanceState);
    }
}
