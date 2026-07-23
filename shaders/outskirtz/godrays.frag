#pragma header
uniform float iTime;

vec4 crepuscular_rays(vec2 texCoords, vec2 lightPos) {
    const int nsamples = 30;
    vec2 uv = texCoords;
    
    float density = 0.3;
    float decay = 0.9;
    float weight = 0.2;

    vec2 deltaTexCoord = (uv - lightPos) * (density / float(nsamples));
    float illuminationDecay = 1.0;
    vec4 color = flixel_texture2D(bitmap, uv) * 0.15;

    for (int i = 0; i < nsamples; i++) {
        uv -= deltaTexCoord;
        
        if (uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0) {
            vec4 sampleColor = flixel_texture2D(bitmap, uv) * (illuminationDecay * weight);
            color += sampleColor;
        }

        illuminationDecay *= decay;
    }

    return color;
}

void main() {
    vec2 uv = openfl_TextureCoordv.xy;

    vec2 lightPos = vec2(
        0.5 + sin(iTime * 0.5) * 0.2,
        0.5 + cos(iTime * 0.3) * 0.2
    );

    vec4 rays = crepuscular_rays(uv, lightPos);
    
    vec4 baseColor = flixel_texture2D(bitmap, uv);
    gl_FragColor = mix(baseColor, rays, 0.25);
}
