export default function Film() {return <scene id="cut05f" name="一筷之间" active width={1080} height={1920} fill="#1e2927" workarea={[0,34]}>
<sequence id="city" name="city">
<video id="m1" src="wheel-in-motion.mp4" start={0} end={5.5} sourceIn={0} x={0} y={139} width={1080} height={804} muted/>
<video id="m2" src="painted-arrow.mp4" start={5.5} end={11} sourceIn={0} x={0} y={139} width={1080} height={804} muted/>
<video id="m3" src="stationary-wheel.mp4" start={11} end={28} sourceIn={0} x={0} y={139} width={1080} height={804} muted/>
</sequence>
<sequence id="meal" name="meal">
<video id="s1" src="pack.mp4" start={0} end={5} sourceIn={1} x={0} y={977} width={1080} height={804} muted/>
<video id="s2" src="leave.mp4" start={5} end={10} sourceIn={0} x={0} y={977} width={1080} height={804} muted/>
<video id="s3" src="table.mp4" start={10} end={16} sourceIn={1} x={0} y={977} width={1080} height={804} muted/>
<video id="s4" src="reach.mp4" start={16} end={21} sourceIn={0} x={0} y={977} width={1080} height={804} muted/>
<video id="s5" src="chopsticks-to-bowl.mp4" start={21} end={28} sourceIn={0} x={0} y={977} width={1080} height={804} muted/>
<video id="s6" src="seated.mp4" start={28} end={34} sourceIn={0} x={0} y={320} width={1080} height={1250} muted/>
</sequence>
<text id="end" fontFamily="PingFang SC" fontSize={56} color="#f4e4c6" start={31.1} end={34} x={66} y={1650} width={950} height={140}>一筷之间</text>
<audio id="musiccut05f" src="05-wood-porcelain.wav" start={0} end={34}/>
</scene>;}