export default function Film() {return <scene id="cut02e" name="开饭以前" active width={1080} height={1920} fill="#202825" workarea={[0,36]}>
<sequence id="the_day" name="the_day">
<video id="open" src="lid-opens.mp4" start={0} end={7.8} sourceIn={0} x={0} y={173} width={1080} height={1580} muted/>
<video id="people" src="looking-in.mp4" start={7.8} end={12.8} sourceIn={0.8} x={0} y={173} width={1080} height={1580} muted/>
<video id="exit" src="leave.mp4" start={12.8} end={17.5} sourceIn={0.3} x={0} y={173} width={1080} height={1580} muted/>
<video id="drive" src="road.mp4" start={17.5} end={20} sourceIn={1} x={0} y={173} width={1080} height={1580} muted/>
<video id="arrive" src="table.mp4" start={20} end={24} sourceIn={1} x={0} y={173} width={1080} height={1580} muted/>
<video id="serve" src="eat-together.mp4" start={24} end={26.4} sourceIn={0} x={0} y={173} width={1080} height={1580} muted/>
<video id="food" src="chopsticks-to-bowl.mp4" start={26.4} end={32.5} sourceIn={0.7} x={0} y={173} width={1080} height={1580} muted/>
<video id="return" src="seated.mp4" start={32.5} end={36} sourceIn={2.2} x={0} y={173} width={1080} height={1580} muted/>
</sequence>
<text id="name" fontFamily="PingFang SC" fontSize={53} color="#f4e4c6" start={0.5} end={3.5} x={65} y={66} width={950} height={140}>开饭以前</text>
<text id="end" fontFamily="PingFang SC" fontSize={52} color="#f4e4c6" start={33.1} end={35.7} x={65} y={1768} width={950} height={140}>开饭。</text>
<audio id="musiccut02e" src="02-closing.wav" start={0} end={36}/>
</scene>;}