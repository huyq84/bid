// platform/js/sections/s14_closing.js
// 14 封尾 - free 型, 居中感谢语 + 编辑 textarea
window.Sections = window.Sections || {};
window.Sections["14"] = {
  title: "封尾",
  is_closing: true,

  _content(report) {
    const pd = report.pages_data && report.pages_data['14'];
    return (pd && pd.content) || '感谢阅读本报告, 如有疑问请与清尚项目部联系。';
  },

  render(report) {
    const text = this._content(report);
    return '' +
      '<div class="section-card">' +
        '<div class="section-header">' +
          '<div>' +
            '<div class="section-title">封尾</div>' +
            '<div class="text-xs text-slate-500 mt-1">本章节为周报最后一页 · 居中显示, 可编辑文字内容</div>' +
          '</div>' +
        '</div>' +
        '<div class="section-body">' +
          // 居中感谢语 - 模拟 1280×720 画布
          '<div class="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-sm">' +
            '<div class="bg-gradient-to-br from-slate-50 to-blue-50 flex flex-col items-center justify-center text-center" style="height:420px; padding:40px">' +
              '<div class="text-2xl font-bold text-blue-600 mb-3 tracking-widest">— 完 —</div>' +
              '<textarea class="w-full max-w-2xl text-center text-lg text-slate-700 leading-relaxed bg-transparent border-none focus:outline-none resize-none focus:bg-white/60 rounded p-3" rows="3" onchange="App.s14Update(this.value)">' + text + '</textarea>' +
              '<div class="mt-6 text-sm text-slate-500">北京清尚 · 装饰周报</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
  }
};
