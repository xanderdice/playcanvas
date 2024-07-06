/*PUT THIS SCRIPT ON ENTITY YOU NEED VIDEO TEXTURE*/

var VideoTexture = pc.createScript('videoTexture');

VideoTexture.attributes.add('videoAsset', {
    title: 'Video Asset',
    description: 'MP4 video asset to play back on this video texture.',
    type: 'asset'
});

VideoTexture.attributes.add('videoUrl', {
    title: 'Video Url',
    description: 'URL to use if there is video asset selected',
    type: 'string'
});

VideoTexture.attributes.add('playEvent', {
    title: 'Play Event',
    description: 'Event that is fired as soon as the video texture is ready to play.',
    type: 'string',
    default: ''
});

// initialize code called once per entity
VideoTexture.prototype.initialize = function () {
    this.timeAccumulator = 0;
    var app = this.app;

    // Create HTML Video Element to play the video
    this.video = document.createElement('video');
    this.video.loop = true;

    // muted attribute is required for videos to autoplay
    this.video.muted = false;

    // critical for iOS or the video won't initially play, and will go fullscreen when playing
    this.video.playsInline = true;

    // needed because the video is being hosted on a different server url
    this.video.crossOrigin = "anonymous";

    // autoplay the video
    this.video.autoplay = false;

    // iOS video texture playback requires that you add the video to the DOMParser
    // with at least 1x1 as the video's dimensions
    var style = this.video.style;
    style.left = "-1px";
    style.top = "-1px";
    style.width = '1px';
    style.height = '1px';
    style.position = 'absolute';
    style.opacity = '0';
    style.pointerEvents = 'none';
    style.display = "none";

    this.video.src = this.videoAsset ? this.videoAsset.getFileUrl() : this.videoUrl;
    this.videoAsset.unload();

    this.video.load();

    this.video.addEventListener('canplaythrough', function (e) {
        this.mat = new pc.StandardMaterial();
        this.entity.render.material = this.mat;
        //this.mat.lightMap = this.videoTexture;
        this.mat.emissiveMap = this.videoTexture;
        this.mat.update();
        this.video.pause();
        //this.video.currentTime = 0;
    }.bind(this));
    document.body.appendChild(this.video);




    // Create a texture to hold the video frame data
    this.videoTexture = new pc.Texture(app.graphicsDevice, {
        format: pc.PIXELFORMAT_R8_G8_B8,
        minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR,
        magFilter: pc.FILTER_LINEAR,
        addressU: pc.ADDRESS_CLAMP_TO_EDGE,
        addressV: pc.ADDRESS_CLAMP_TO_EDGE,
        mipmaps: false
    });

    this.videoTexture.setSource(this.video);


    this.on("destroy", function () {
        this.video.pause();
        this.videoTexture.destroy();
        this.video.removeAttribute("src");
        this.video.load();
        this.video.remove();
    }, this);
};

// update code called every frame
VideoTexture.prototype.update = function (dt) {
    if (this.app.isMenuMode) {
        if (!this.video.paused) {
            try {
                this.video.pause();
                //*Trace("video", "se puse en pausa");*/
                /*Trace("this.video.paused", this.video.paused);*/
            } catch {
                /*Trace("video", "ERROR al poner pause");*/

            }
        }
    } else {
        if (this.video.paused) {
            try {
                this.video.play();
                /*Trace("video", "se puse en PLAY");*/
                /*Trace("this.video.paused", this.video.paused);*/
            } catch {
                /*Trace("video", "error al poner play");*/
            }
        }
    }



    if (!this.video.paused) {
        this.timeAccumulator += dt;

        if (this.timeAccumulator >= 0.05) {
            this.timeAccumulator = 0;
            this.videoTexture.upload();
        }
    }

};