// モジュールのインポート
import { ObjectDetector, FilesetResolver } from "./vision_bundle.mjs";
var objectDetector;
let runningMode = "IMAGE";

// オブジェクト検出器を初期化する関数
const initializeObjectDetector = async () => {
    // FilesetResolverを使って視覚タスクを解決するためのパスを指定
    const vision = await FilesetResolver.forVisionTasks("./wasm");
    objectDetector = await ObjectDetector.createFromOptions(vision, {
        baseOptions: {
            // モデルのパスを指定
            modelAssetPath: `./models/MobileNetV2_320I_Mickey_fp16.tflite`,
            delegate: "GPU" // GPUで実行するように設定
        },
        scoreThreshold: 0.35, // 検出のスコアしきい値を設定
        runningMode: runningMode // 初期実行モードを設定
    });

    // カメラを有効にする
    enableCam();
    // ローディングインジケーターを非表示にする
    document.querySelector('#loading').style.display = 'none';
};

// オブジェクト検出器を初期化する
initializeObjectDetector();


/********************************************************************
 // デモ2: ウェブカムストリームから連続的に画像を取得し、検出を実行
 ********************************************************************/
let video = document.getElementById("webcam");
let enableWebcamButton;

// ウェブカムがサポートされているか確認する関数
function hasGetUserMedia() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

// 作成した要素を簡単に削除するため、すべての子要素を保持
var children = [];

// ウェブカムがサポートされている場合、ユーザーがアクティブにしたい時用のボタンにイベントリスナーを追加
if (hasGetUserMedia()) {
    // enableWebcamButton = document.getElementById("webcamButton");
    // enableWebcamButton.addEventListener("click", enableCam);
} else {
    console.warn("getUserMedia() はお使いのブラウザでサポートされていません");
}

// ライブウェブカムのビューを有効にし、検出を開始する関数
async function enableCam(event) {
    // オブジェクト検出器がロードされていない場合はメッセージを表示して終了
    if (!objectDetector) {
        console.log("オブジェクト検出器がまだロードされていません。");
        return;
    }

    // localStorageに保存されたcameraIdがあれば、それを使用
    const cameraId = localStorage.getItem('cameraId');

    // getUserMediaのパラメータを設定
    const constraints = {
        video: {
            deviceId: cameraId,
            facingMode: 'environment', // 環境カメラを使用
            width: { max: 1920 },
            height: { max: 1080 },
            aspectRatio: { ideal: 1.0 } // アスペクト比の理想値
        }
    };

    // ウェブカムストリームを有効にする
    navigator.mediaDevices
        .getUserMedia(constraints)
        .then(function (stream) {
            video.srcObject = stream;
            window.currentStream = stream;

            // ストリームの詳細情報を取得
            let videoTrack = stream.getVideoTracks()[0];
            let settings = videoTrack.getSettings();
            let capabilities = videoTrack.getCapabilities();

            // ズーム機能をデバッグしたい場合はコメントを外す
            // capabilities.zoom = { min: 1, max: 10, step: 0.1 };
            // settings.zoom = 5;

            // // ズームUIを表示する
            // if (capabilities.zoom) {
            //     if (!capabilities.zoom.step) {
            //         capabilities.zoom.step = 0.1;
            //     }
            //     document.getElementById('zoom_ui').innerHTML = `
            //         <div class="row mt-2 mb-2">
            //             <div class="col-2 text-end fs-4">
            //                 <i class="bi bi-zoom-out"></i>
            //             </div>  
            //             <div class="col-8 text-center">
            //                 <input type="range" class="form-range" min="${capabilities.zoom.min}" max="${capabilities.zoom.max}" value="${settings.zoom}" step="${capabilities.zoom.step}" id="zoom_ui_input">
            //             </div>
            //             <div class="col-2 text-start fs-4">
            //                 <i class="bi bi-zoom-in"></i>
            //             </div>
            //         </div>
            //         `;
            //     document.getElementById('zoom_ui_input').addEventListener('input', (event) => {
            //         videoTrack.applyConstraints({ advanced: [{ zoom: parseFloat(event.target.value) }] });
            //     });
            // }

            // データが読み込まれたら検出を開始
            video.addEventListener("loadeddata", predictWebcam);
        })
        .catch((err) => {
            console.error(err);
        });
}

let lastVideoTime = -1;
async function predictWebcam() {
    // 初回の実行モードが"IMAGE"の場合、ビデオの実行モードで新しい分類器を作成
    if (runningMode === "IMAGE") {
        runningMode = "VIDEO";
        await objectDetector.setOptions({ runningMode: "VIDEO" });
    }

    let nowInMs = Date.now();

    // detectForVideoを使ってオブジェクトを検出
    if (video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime;
        const detections = await objectDetector.detectForVideo(video, nowInMs);

        // 検出結果を表示する関数を呼び出す
        gotDetections(detections);
    }

    // ブラウザが準備ができたら再度この関数を呼び出して予測を継続
    window.requestAnimationFrame(predictWebcam);
}

// 信頼度のしきい値を変更するイベントリスナー
document.querySelector('#input_confidence_threshold').addEventListener('change', changedConfidenceThreshold);

function changedConfidenceThreshold(e) {
    console.log(e.srcElement.value);
    // しきい値をfloatにキャスト
    let confidenceThreshold = parseFloat(e.srcElement.value);
    objectDetector.setOptions(
        {
            scoreThreshold: confidenceThreshold
        }
    )
    document.querySelector('#confidence_threshold').innerHTML = e.srcElement.value;
}

// カメラのリストを取得する関数
async function listCameras() {
    try {
        const selectCamera = document.getElementById('select_camera');
        navigator.mediaDevices.enumerateDevices()
            .then(devices => {
                console.log(devices);
                devices.forEach(device => {
                    if (device.kind === 'videoinput') {
                        const option = document.createElement('option');
                        option.text = device.label || `camera ${selectCamera.length + 1}`;
                        option.value = device.deviceId;
                        
                        // localStorageに保存されたcameraIdがあれば、それを選択状態にする
                        const cameraId = localStorage.getItem('cameraId');
                        if (cameraId === device.deviceId) {
                            option.selected = true;
                        }
                        selectCamera.appendChild(option);
                    }
                });
            });
    } catch (err) {
        console.error('メディアデバイスへのアクセス中にエラーが発生しました。', err);
    }
}
await listCameras();

// カメラのリフレッシュボタンを押した時のイベントリスナー
document.querySelector('#button_refresh_camera').addEventListener('click', async () => {
    try {
        // 仮のカメラアクセスをリクエストしてユーザーの許可を取得
        const initialStream = await navigator.mediaDevices.getUserMedia({ video: true });
        document.querySelector('#select_camera').innerHTML = '';
        await listCameras();

        if (initialStream) {
            initialStream.getTracks().forEach(track => track.stop());
        }
    } catch (err) {
        console.error('メディアデバイスへのアクセス中にエラーが発生しました。', err);
    }
})

// カメラ選択が変更された時のイベントリスナー
document.getElementById('select_camera').addEventListener('change', changedCamera);
function changedCamera() {
    const selectCamera = document.getElementById('select_camera');
    const constraints = {
        video: {
            deviceId: selectCamera.value,
            facingMode: 'environment',
            width: { max: 1920 },
            height: { max: 1080 },
            aspectRatio: { ideal: 1.0 }
        }
    };

    // 選択されたカメラIDをlocalStorageに保存
    localStorage.setItem('cameraId', selectCamera.value);

    navigator.mediaDevices
        .getUserMedia(constraints)
        .then(function (stream) {
            video.srcObject = stream;
            video.addEventListener("loadeddata", predictWebcam);
        })
        .catch((err) => {
            console.error(err);
        });
}
