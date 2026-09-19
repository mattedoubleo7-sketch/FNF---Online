#pragma header
precision mediump float;
uniform float contrast;

void main()
{
    vec2 uv = openfl_TextureCoordv;
    vec4 col = texture2D(bitmap, uv);
    col.rgb = (col.rgb - 0.5) * contrast + 0.5;
    gl_FragColor = clamp(col, 0.0, 1.0);
}