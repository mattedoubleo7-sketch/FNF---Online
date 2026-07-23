#pragma header
//https://github.com/bbpanzu/FNF-Sunday/blob/main/source_sunday/RadialBlur.hx
//https://www.shadertoy.com/view/XsfSDs
	
	const int nsamples = 10; //samples
	
	void main(){
		vec4 color = texture2D(bitmap, openfl_TextureCoordv);
			vec2 res;
			res = openfl_TextureCoordv;
		vec2 pp;
		pp = vec2(0.4, 0.4);
		vec2 center = pp;

		
		vec2 uv = openfl_TextureCoordv.xy;
		
		uv -= center;
		float precompute = 0.02 * (1.0 / float(nsamples - 1));
		
		for(int i = 0; i < nsamples; i++)
		{
			float scale = 1.0 + (float(i)* precompute);
		color += texture2D(bitmap, uv * scale + center);
		}
		
		
		color /= float(nsamples);
		
		gl_FragColor = color; 
	
	}
	