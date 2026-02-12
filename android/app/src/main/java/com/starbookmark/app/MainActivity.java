package com.starbookmark.app;

import android.os.Bundle;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // 스플래시를 설치해 테마에 정의된 스플래시가 앱 준비될 때까지 표시되도록 함
        SplashScreen.installSplashScreen(this);
        super.onCreate(savedInstanceState);
    }
}
